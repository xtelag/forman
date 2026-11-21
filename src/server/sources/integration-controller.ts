// Standalone browser code shared by the JavaScript and React examples.
export const integrationController = `function mountIntegration(form, config) {
  const fields = form.querySelector('[data-fields]');
  const protectionFields = form.querySelector('[data-protection]');
  const status = form.querySelector('[role="status"]');
  const retry = form.querySelector('[data-retry]');
  const reload = form.querySelector('[data-reload]');
  const saveDraft = form.querySelector('[data-save]');
  // Keep step IDs stable; multiple fields can share the same data-step section.
  const steps = Array.from(form.querySelectorAll('[data-step]'));
  const back = form.querySelector('[data-back]'), next = form.querySelector('[data-next]');
  const progress = form.querySelector('[data-progress]');
  let currentStep = 0, focusStep = false;
  const submit = form.querySelector('[type="submit"]');
  let disposed = false, busy = false, blocked = false, done = false;
  let session = null, pending = null, retryAction = null, retryAt = 0;
  // sessionId is the secret identifier granting access to this draft.
  let sessionId = new URLSearchParams(location.hash.slice(1)).get('session');
  const returning = Boolean(sessionId);
  if (!sessionId) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    sessionId = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  }
  function message(text) { if (!disposed) status.textContent = text; }
  function controls() {
    if (disposed) return;
    const waiting = Date.now() < retryAt;
    fields.disabled = busy || blocked || done || Boolean(pending || retryAction);
    submit.disabled = busy || blocked || done || Boolean(pending || retryAction) || waiting;
    if (saveDraft) saveDraft.disabled = submit.disabled;
    steps.forEach((step,index) => { step.hidden = index !== currentStep; });
    if (steps.length) submit.hidden = currentStep !== steps.length - 1;
    if (back) { back.hidden = currentStep === 0; back.disabled = submit.disabled; }
    if (next) { next.hidden = currentStep === steps.length - 1; next.disabled = submit.disabled; }
    if (progress) progress.textContent = 'Step ' + (currentStep + 1) + ' of ' + steps.length;
    retry.hidden = !retryAction || done;
    retry.disabled = busy || waiting;
    reload.hidden = !sessionId || !blocked || done;
    reload.disabled = busy || waiting;
    if (protectionFields) protectionFields.hidden = Boolean(session) || returning || done;
  }
  const timer = setInterval(controls, 500);
  function payload() {
    const data = new FormData(form), result = {};
    for (const field of config.fields) {
      const value = data.get(field.name);
      if (value === null || value === '') continue;
      result[field.name] = field.type === 'number' || field.type === 'integer' ? Number(value)
        : field.type === 'boolean' ? value === 'true'
        : field.type === 'array' || field.type === 'object' ? JSON.parse(String(value)) : String(value);
    }
    return result;
  }
  function restore(values) {
    for (const field of config.fields) {
      const control = form.elements.namedItem(field.name);
      const value = values[field.name];
      if (control) control.value = value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
  }
  function protection() {
    const data = new FormData(form), result = {};
    if (config.honeypotFieldNames.length) result.honeypot = Object.fromEntries(config.honeypotFieldNames.map(name => {
      const values = data.getAll(name);
      if (values.length !== 1 || values[0] !== '') throw new Error('Complete verification first.');
      return [name, ''];
    }));
    if (config.altcha) {
      result.altcha = String(data.get('altcha') ?? '');
      if (!result.altcha) throw new Error('Complete verification first.');
    }
    return result;
  }
  async function request(body) {
    const response = await fetch(config.endpoint, {
      method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...body, sessionId}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429) retryAt = Date.now() + (Number(response.headers.get('Retry-After')) || 60) * 1000;
      const error = new Error(response.status === 429 ? 'Too many requests. Wait before retrying.' : result.error || 'Request failed.');
      error.status = response.status;
      throw error;
    }
    return result;
  }
  function accept(result, replaceAnswers) {
    if (disposed) return;
    session = result; blocked = false; pending = null; retryAction = null;
    done = result.status === 'completed';
    const restoredStep = steps.findIndex(step => Number(step.dataset.step) === result.meta?.currentPage);
    if (restoredStep >= 0) currentStep = restoredStep;
    focusStep = steps.length > 0;
    if (replaceAnswers) restore(result.payload || {});
    message(done ? 'Response submitted.' : 'Draft saved. Keep this page address to continue later or on another device.');
  }
  async function run(action) {
    if (busy || disposed || Date.now() < retryAt) return;
    busy = true; controls(); message('Working…');
    try { await action(); }
    catch (error) {
      if (disposed) return;
      const code = error.status;
      if (code === 403 && config.altcha) form.querySelector('altcha-widget')?.reset?.();
      if (code === 409) { blocked = true; retryAction = null; }
      else if (code === 404 || code === 410 || code === 401) { blocked = true; retryAction = null; done = true; }
      else if (code && code < 500 && code !== 429) { pending = null; retryAction = null; }
      else retryAction = action; // Same operationId and body after an uncertain save.
      message(code === 403 ? 'Verification failed. Complete verification again.' : code === 409 ? 'This session changed elsewhere. Load saved answers before continuing.'
        : code === 410 ? 'This session has expired. It cannot be reopened.'
        : error.message || 'Connection failed. Retry without changing the pending request.');
    } finally { busy = false; controls(); if (focusStep) { steps[currentStep]?.focus(); focusStep = false; } }
  }
  async function read() {
    blocked = true; controls();
    const result = await request({operation: 'read'});
    accept(result, true);
  }
  function validateSteps(all) {
    const candidates = steps.length ? (all ? steps : [steps[currentStep]]) : [fields];
    for (const step of candidates) {
      const invalid = Array.from(step.querySelectorAll('input,select,textarea')).find(control => !control.checkValidity());
      if (invalid) {
        if (steps.length) { currentStep = steps.indexOf(step); controls(); }
        invalid.reportValidity(); return false;
      }
    }
    return true;
  }
  async function save(final, destination = currentStep) {
    if (busy || blocked || done || pending || retryAction) return;
    if ((final || destination > currentStep) && !validateSteps(final)) return;
    // Read values BEFORE disabling the fieldset (disabled fields are absent from FormData).
    let answers, proof;
    try { answers = payload(); proof = !session ? protection() : {}; }
    catch (error) { message(error.message); return; }
    await run(async () => {
      if (!session) {
        const url = new URL(location.href);
        url.hash = new URLSearchParams({session: sessionId}).toString();
        history.replaceState(null, '', url); // Capability stays in the fragment, never the query.
        session = await request({operation: 'open', protection: proof});
        if (disposed) return;
        if (session.status === 'completed') { accept(session, true); return; }
      }
      pending = pending || {operation: 'update', operationId: crypto.randomUUID(), revision: session.revision,
        currentPage: steps.length ? Number(steps[destination].dataset.step) : session.meta.currentPage, payload: answers, final};
      const result = await request(pending);
      accept(result, true);
    });
  }
  const onSubmit = event => { event.preventDefault(); if (steps.length && currentStep < steps.length - 1) void save(false,currentStep+1); else void save(true); };
  const onNext = () => { if (currentStep < steps.length - 1) void save(false,currentStep+1); };
  const onBack = () => { if (currentStep > 0) void save(false,currentStep-1); };
  const onDraft = () => { void save(false); };
  const onRetry = () => { if (retryAction) void run(retryAction); };
  const onReload = () => {
    if (confirm('Replace local answers with the saved version?')) { pending = null; void run(read); }
  };
  form.addEventListener('submit', onSubmit);
  if (saveDraft) saveDraft.addEventListener('click', onDraft);
  if (next) next.addEventListener('click', onNext);
  if (back) back.addEventListener('click', onBack);
  retry.addEventListener('click', onRetry);
  reload.addEventListener('click', onReload);
  if (returning) { blocked = true; void run(read); }
  controls();
  return () => {
    disposed = true; clearInterval(timer);
    form.removeEventListener('submit', onSubmit);
    if (saveDraft) saveDraft.removeEventListener('click', onDraft);
    if (next) next.removeEventListener('click', onNext);
    if (back) back.removeEventListener('click', onBack);
    retry.removeEventListener('click', onRetry); reload.removeEventListener('click', onReload);
  };
}`;

export const oneShotController = `function mountIntegration(form, config) {
  const button = form.querySelector('[type="submit"]');
  const status = form.querySelector('[role="status"]');
  let busy = false, disposed = false;
  async function onSubmit(event) {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    const data = new FormData(form), payload = {};
    try {
      for (const field of config.fields) {
        const value = data.get(field.name);
        if (value === null || value === '') continue;
        payload[field.name] = field.type === 'number' || field.type === 'integer' ? Number(value)
          : field.type === 'boolean' ? value === 'true'
          : field.type === 'array' || field.type === 'object' ? JSON.parse(String(value)) : String(value);
      }
      for (const name of config.honeypotFieldNames) {
        const values = data.getAll(name);
        if (values.length !== 1 || values[0] !== '') throw new Error('Complete verification first.');
        payload[name] = '';
      }
      if (config.altcha) {
        payload.altcha = String(data.get('altcha') ?? '');
        if (!payload.altcha) throw new Error('Complete verification first.');
      }
      busy = true; button.disabled = true; status.textContent = 'Submitting…';
      const response = await fetch(config.endpoint, {
        method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload),
      });
      if (disposed) return;
      if (!response.ok) {
        if (response.status === 403) {
          if (config.altcha) form.querySelector('altcha-widget')?.reset?.();
          throw new Error('Verification failed. Complete verification again.');
        }
        const result = await response.json().catch(() => ({}));
        throw new Error(response.status === 429 ? 'Too many requests. Retry after ' + (response.headers.get('Retry-After') || 60) + ' seconds.' : result.error || 'Submission rejected.');
      }
      status.textContent = 'Response submitted.';
      return; // Keep Submit disabled to avoid accidental duplicate submissions.
    } catch (error) {
      if (!disposed) {
        status.textContent = error.message + ' If the connection failed, check whether the response was accepted before resubmitting.';
        button.disabled = false;
      }
    } finally { busy = false; }
  }
  form.addEventListener('submit', onSubmit);
  return () => { disposed = true; form.removeEventListener('submit', onSubmit); };
}`;
