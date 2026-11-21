export const popUpV1Source = String.raw`(function () {
  "use strict";

  var script = document.currentScript;
  if (!script || !script.src) {
    console.error("Forman popup: unable to determine the widget script URL.");
    return;
  }

  var apiOrigin = new URL(script.src, window.location.href).origin;
  var previousApi = window.forman;
  var queuedCalls = previousApi && Array.isArray(previousApi.q) ? previousApi.q.slice() : [];
  var instanceCount = 0;
  var supportedTypes = ["text", "email", "number", "textarea", "select", "checkbox", "radio", "hidden"];
  var altchaScriptUrl = apiOrigin + "/vendor/altcha/altcha.js";

  function configurationError(message) {
    console.error("Forman popup configuration: " + message);
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function nonEmptyText(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  var defaultMessages = {
    close: "Close form",
    error: "Unable to submit the form. Please try again.",
    preview: "Preview only. No data was sent.",
    sending: "Sending…",
    submit: "Submit",
    success: "Response submitted.",
    verificationFailed: "Verification failed. Complete verification again.",
    verificationRequired: "Complete verification first."
  };

  function validateConfig(config) {
    if (!isObject(config)) return "expected a configuration object.";
    if (config.messages !== undefined) {
      if (!isObject(config.messages)) return "messages must be an object.";
      var messageKeys = Object.keys(config.messages);
      for (var messageIndex = 0; messageIndex < messageKeys.length; messageIndex += 1) {
        var messageKey = messageKeys[messageIndex];
        if (!Object.prototype.hasOwnProperty.call(defaultMessages, messageKey)) return "Unknown messages key: " + messageKey;
        if (!nonEmptyText(config.messages[messageKey])) return "messages." + messageKey + " must be non-empty text.";
      }
    }
    if (!nonEmptyText(config.sourceId)) return "sourceId must be a non-empty string.";
    if (!Array.isArray(config.fields) || config.fields.length === 0) return "fields must be a non-empty array.";

    if (config.position !== undefined && ["center", "bottom-right", "bottom-left"].indexOf(config.position) === -1) return "position must be center, bottom-right or bottom-left.";
    if (config.animation !== undefined && ["none", "fade", "slide"].indexOf(config.animation) === -1) return "animation must be none, fade or slide.";

    if (config.buttonColor !== undefined && (typeof config.buttonColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(config.buttonColor))) return "buttonColor must be a six-digit hex color, such as #594aa5.";

    var optionalText = ["title", "description", "submitLabel"];
    for (var textIndex = 0; textIndex < optionalText.length; textIndex += 1) {
      var textKey = optionalText[textIndex];
      if (config[textKey] !== undefined && typeof config[textKey] !== "string") {
        return textKey + " must be text when provided.";
      }
    }
    if (!nonEmptyText(config.title)) return "title must be non-empty text; this setting is required.";
    if (config.submitLabel !== undefined && !nonEmptyText(config.submitLabel)) return "submitLabel must be non-empty text when provided.";
    if (config.trigger !== undefined && !nonEmptyText(config.trigger)) {
      return "trigger must be a non-empty selector string when provided.";
    }
    if (config.closeOnBackdrop !== undefined && typeof config.closeOnBackdrop !== "boolean") return "closeOnBackdrop must be a boolean when provided.";
    if (config.preview !== undefined && typeof config.preview !== "boolean") {
      return "preview must be a boolean when provided.";
    }
    if (config.autoOpen !== undefined && typeof config.autoOpen !== "boolean") {
      return "autoOpen must be a boolean when provided.";
    }
    if (config.apiBaseUrl !== undefined) {
      if (!nonEmptyText(config.apiBaseUrl)) return "apiBaseUrl must be a non-empty URL when provided.";
      try {
        var apiBaseUrl = new URL(config.apiBaseUrl);
        if ((apiBaseUrl.protocol !== "http:" && apiBaseUrl.protocol !== "https:") || apiBaseUrl.origin !== config.apiBaseUrl.replace(/\/$/, "")) {
          return "apiBaseUrl must be an HTTP(S) origin without a path.";
        }
      } catch (_error) {
        return "apiBaseUrl must be an HTTP(S) origin without a path.";
      }
    }
    var names = Object.create(null);
    for (var fieldIndex = 0; fieldIndex < config.fields.length; fieldIndex += 1) {
      var field = config.fields[fieldIndex];
      var position = fieldIndex + 1;
      if (!isObject(field)) return "field " + position + " must be an object.";
      if (!nonEmptyText(field.name)) return "field " + position + " must have a non-empty name.";
      if (names[field.name]) return "field names must be unique; duplicate name ‘" + field.name + "’.";
      names[field.name] = true;
      if (supportedTypes.indexOf(field.type) === -1) {
        return "field ‘" + field.name + "’ has unsupported type ‘" + String(field.type) + "’.";
      }
      if (field.type !== "hidden" && !nonEmptyText(field.label)) {
        return "field ‘" + field.name + "’ must have a non-empty label.";
      }
      if (field.label !== undefined && typeof field.label !== "string") {
        return "field ‘" + field.name + "’ label must be text.";
      }
      if (field.required !== undefined && typeof field.required !== "boolean") {
        return "field ‘" + field.name + "’ required must be a boolean.";
      }
      if (field.value !== undefined && typeof field.value !== "string") {
        return "field ‘" + field.name + "’ value must be text.";
      }
      if (field.type === "select" || field.type === "radio") {
        if (!Array.isArray(field.options) || field.options.length === 0) {
          return "field ‘" + field.name + "’ requires at least one option.";
        }
        for (var optionIndex = 0; optionIndex < field.options.length; optionIndex += 1) {
          var option = field.options[optionIndex];
          if (!isObject(option) || !nonEmptyText(option.label) || !nonEmptyText(option.value)) {
            return "field ‘" + field.name + "’ options require non-empty label and value text.";
          }
        }
      }
    }

    if (config.trigger !== undefined) {
      var matches;
      try {
        matches = document.querySelectorAll(config.trigger);
      } catch (_error) {
        return "trigger must be a valid selector matching exactly one element.";
      }
      if (matches.length !== 1) return "trigger must match exactly one element; found " + matches.length + ".";
    }

    return null;
  }

  function addStyles() {
    if (document.getElementById("forman-popup-v1-styles")) return;
    var style = document.createElement("style");
    style.id = "forman-popup-v1-styles";
    style.textContent = "[data-forman-widget],[data-forman-widget] *{box-sizing:border-box}" +
      "[data-forman-floating-trigger]{position:fixed;right:1.25rem;bottom:1.25rem;z-index:2147483000;border:0;border-radius:999px;padding:.75rem 1rem;background:#111827;color:#fff;font:600 14px/1.25 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2);cursor:pointer}" +
      "[data-forman-overlay]{position:fixed;inset:0;z-index:2147483001;display:grid;place-items:center;padding:1rem;background:rgba(15,23,42,.58)}" +
      "[data-forman-overlay][hidden]{display:none}" +
      "[data-forman-position=bottom-right]{align-items:end;justify-items:end}[data-forman-position=bottom-left]{align-items:end;justify-items:start}" +
      "@keyframes forman-popup-fade{from{opacity:0}to{opacity:1}}@keyframes forman-popup-slide{from{opacity:0;transform:translateY(1.5rem)}to{opacity:1;transform:translateY(0)}}" +
      "[data-forman-open=true][data-forman-animation=fade]{animation:forman-popup-fade .32s cubic-bezier(0.22,1,0.36,1)}[data-forman-open=true][data-forman-animation=slide]{animation:forman-popup-slide .32s cubic-bezier(0.22,1,0.36,1)}" +
      "@media(prefers-reduced-motion:reduce){[data-forman-dialog][data-forman-animation]{animation:none}}" +
      "[data-forman-dialog]{position:relative;width:min(32rem,calc(100vw - 2rem));max-height:calc(100dvh - 2rem);overflow:auto;border-radius:.75rem;background:#fff;color:#111827;padding:1.5rem;box-shadow:0 24px 64px rgba(0,0,0,.28);font:400 16px/1.5 system-ui,sans-serif}" +
      "[data-forman-title]{margin:0;padding-right:2rem;font-size:1.25rem;line-height:1.35}" +
      "[data-forman-description]{margin:.5rem 0 0;color:#4b5563}" +
      "[data-forman-close]{position:absolute;top:.75rem;right:.75rem;border:0;background:transparent;color:inherit;font-size:1.5rem;line-height:1;cursor:pointer}" +
      "[data-forman-form]{display:grid;gap:1rem;margin:16px 0 0}" +
      "[data-forman-field]{display:grid;gap:.375rem;margin:0;padding:0;border:0}" +
      "[data-forman-label]{font-weight:600;font-size:.875rem}" +
      "[data-forman-control]{width:100%;min-height:2.75rem;border:1px solid #9ca3af;border-radius:.375rem;background:#fff;color:#111827;padding:.625rem .75rem;font:inherit}" +
      "textarea[data-forman-control]{min-height:7rem;resize:vertical}" +
      "[data-forman-choice]{display:flex;align-items:center;gap:.5rem}" +
      "[data-forman-submit]{min-height:2.75rem;border:0;border-radius:.375rem;background:#111827;color:#fff;padding:.625rem 1rem;font:600 1rem/1.25 system-ui,sans-serif;cursor:pointer}" +
      "[data-forman-submit]:disabled{opacity:.65;cursor:wait}" +
      "[data-forman-state]{margin:0;border-radius:.375rem;padding:.75rem;background:#f3f4f6}" +
      "[data-forman-state][hidden]{display:none}" +
      "[data-forman-honeypot]{position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important}" +
      "@media(max-width:36rem){[data-forman-overlay]{padding:.5rem;align-items:end}[data-forman-dialog]{width:100%;max-height:calc(100dvh - 1rem);border-radius:.75rem .75rem 0 0;padding:1.25rem}}";
    document.head.appendChild(style);
  }

  function element(tag, attributes, text) {
    var node = document.createElement(tag);
    if (attributes) {
      Object.keys(attributes).forEach(function (name) {
        if (attributes[name] !== undefined) node.setAttribute(name, String(attributes[name]));
      });
    }
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function appendLabel(container, id, text) {
    container.appendChild(element("label", { "data-forman-label": "", "for": id }, text));
  }

  function renderField(form, field, idPrefix, fieldIndex) {
    var id = idPrefix + "-field-" + fieldIndex;
    if (field.type === "hidden") {
      form.appendChild(element("input", { name: field.name, type: "hidden", value: field.value || "" }));
      return;
    }

    if (field.type === "radio") {
      var fieldset = element("fieldset", { "data-forman-field": "" });
      fieldset.appendChild(element("legend", { "data-forman-label": "" }, field.label));
      field.options.forEach(function (option, optionIndex) {
        var optionId = id + "-" + optionIndex;
        var optionLabel = element("label", { "data-forman-choice": "", "for": optionId });
        var radio = element("input", { id: optionId, name: field.name, type: "radio", value: option.value });
        if (field.required && optionIndex === 0) radio.required = true;
        optionLabel.appendChild(radio);
        optionLabel.appendChild(document.createTextNode(option.label));
        fieldset.appendChild(optionLabel);
      });
      form.appendChild(fieldset);
      return;
    }

    if (field.type === "checkbox") {
      var checkboxContainer = element("div", { "data-forman-field": "" });
      var checkboxLabel = element("label", { "data-forman-choice": "", "for": id });
      var checkbox = element("input", { id: id, name: field.name, type: "checkbox", value: field.value === undefined ? "true" : field.value });
      checkbox.required = Boolean(field.required) && field.value !== undefined && field.dataType !== "boolean";
      checkboxLabel.appendChild(checkbox);
      checkboxLabel.appendChild(document.createTextNode(field.label));
      checkboxContainer.appendChild(checkboxLabel);
      form.appendChild(checkboxContainer);
      return;
    }

    var container = element("div", { "data-forman-field": "" });
    appendLabel(container, id, field.label);
    var control;
    if (field.type === "textarea") {
      control = element("textarea", { "data-forman-control": "", id: id, name: field.name });
      if (field.value !== undefined) control.value = field.value;
    } else if (field.type === "select") {
      control = element("select", { "data-forman-control": "", id: id, name: field.name });
      if (field.dataType !== undefined) control.appendChild(element("option", { value: "" }, "Choose…"));
      field.options.forEach(function (option) {
        var optionElement = element("option", { value: option.value }, option.label);
        if (field.value !== undefined && field.value === option.value) optionElement.selected = true;
        control.appendChild(optionElement);
      });
    } else {
      control = element("input", { "data-forman-control": "", id: id, name: field.name, type: field.type, step: field.type === "number" ? (field.step || "any") : undefined });
      if (field.value !== undefined) control.value = field.value;
    }
    control.required = Boolean(field.required);
    container.appendChild(control);
    form.appendChild(container);
  }

  function addAltchaScript() {
    if (document.querySelector("script[data-forman-altcha]")) return;
    var altchaScript = element("script", { "data-forman-altcha": "", src: altchaScriptUrl, type: "module" });
    document.head.appendChild(altchaScript);
  }

  function focusableElements(dialog) {
    return Array.prototype.slice.call(dialog.querySelectorAll("button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[href],[tabindex]:not([tabindex='-1'])"))
      .filter(function (candidate) { return candidate.getAttribute("type") !== "hidden" && !candidate.hidden; });
  }

  function styleButton(button, color) {
    if (!button) return;
    var channels = [1, 3, 5].map(function (offset) {
      var value = parseInt(color.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    var luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    button.style.backgroundColor = color;
    button.style.color = (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
  }

  function buildWidget(config, capabilities, sourceApiOrigin) {
    var messages = Object.assign({}, defaultMessages, config.messages || {});
    addStyles();
    instanceCount += 1;
    var idPrefix = "forman-popup-v1-" + instanceCount;
    var titleText = config.title;
    var root = element("div", { "data-forman-widget": "" });
    var buttonColor = config.buttonColor || "#594aa5";
    var trigger;

    if (config.trigger === undefined && !config.autoOpen) {
      trigger = element("button", { "data-forman-floating-trigger": "", type: "button" }, titleText);
      root.appendChild(trigger);
    } else if (config.trigger !== undefined) {
      trigger = document.querySelector(config.trigger);
    }

    styleButton(trigger, buttonColor);

    var overlay = element("div", { "data-forman-overlay": "", "data-forman-position": config.position || "bottom-right", hidden: "" });
    var dialog = element("div", {
      "aria-labelledby": idPrefix + "-title",
      "aria-modal": "true",
      "data-forman-dialog": "",
      "data-forman-animation": config.animation || "slide",
      "data-forman-open": "false",
      role: "dialog",
      tabindex: "-1"
    });
    var title = element("h2", { "data-forman-title": "", id: idPrefix + "-title" }, titleText);
    var close = element("button", { "aria-label": messages.close, "data-forman-close": "", type: "button" }, "×");
    dialog.appendChild(title);
    dialog.appendChild(close);
    if (nonEmptyText(config.description)) {
      dialog.setAttribute("aria-describedby", idPrefix + "-description");
      dialog.appendChild(element("p", { "data-forman-description": "", id: idPrefix + "-description" }, config.description));
    }

    var form = element("form", { "data-forman-form": "" });
    config.fields.forEach(function (field, fieldIndex) { renderField(form, field, idPrefix, fieldIndex); });
    if (capabilities.honeypotEnabled) {
      capabilities.honeypotFieldNames.forEach(function (name) { form.appendChild(element("input", {
        "aria-hidden": "true",
        autocomplete: "off",
        "data-forman-honeypot": "",
        name: name,
        tabindex: "-1",
        type: "text"
      })); });
    }
    if (capabilities.altchaEnabled) {
      addAltchaScript();
      form.appendChild(element("altcha-widget", {
        challengeurl: sourceApiOrigin + "/api/challenge/" + encodeURIComponent(config.sourceId),
        name: "altcha"
      }));
    }

    var state = element("p", { "aria-live": "polite", "data-forman-state": "", hidden: "" });
    var submit = element("button", { "data-forman-submit": "", type: "submit" }, config.submitLabel === undefined ? messages.submit : config.submitLabel);
    styleButton(submit, buttonColor);
    form.appendChild(state);
    form.appendChild(submit);
    dialog.appendChild(form);
    overlay.appendChild(dialog);
    root.appendChild(overlay);
    document.body.appendChild(root);

    var opener = null;
    function openDialog(event) {
      if (event) event.preventDefault();
      opener = trigger;
      overlay.hidden = false;
      dialog.setAttribute("data-forman-open", "true");
      close.focus();
    }
    function closeDialog() {
      if (overlay.hidden) return;
      overlay.hidden = true;
      dialog.setAttribute("data-forman-open", "false");
      if (opener && typeof opener.focus === "function") opener.focus();
    }
    if (trigger) trigger.addEventListener("click", openDialog);
    close.addEventListener("click", closeDialog);
    var backdropPress = false;
    overlay.addEventListener("pointerdown", function (event) {
      backdropPress = event.target === overlay && event.button === 0 && event.isPrimary !== false;
    });
    overlay.addEventListener("pointercancel", function () { backdropPress = false; });
    overlay.addEventListener("click", function (event) {
      var dismiss = backdropPress && event.target === overlay;
      backdropPress = false;
      if (event.target !== overlay) return;
      event.preventDefault();
      event.stopPropagation();
      if (dismiss && config.closeOnBackdrop !== false) closeDialog();
    });

    function onKeydown(event) {
      if (overlay.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== "Tab") return;
      var focusable = focusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeydown);

    function showState(kind, message) {
      state.hidden = false;
      state.setAttribute("data-forman-state", kind);
      state.setAttribute("role", kind === "error" ? "alert" : "status");
      state.textContent = message;
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      submit.disabled = true;
      showState("loading", messages.sending);
      if (config.preview) {
        form.reset();
        showState("success", messages.preview);
        submit.disabled = false;
        return;
      }
      try {
        var body = new URLSearchParams();
        var formData = new FormData(form);
        if (capabilities.honeypotEnabled) capabilities.honeypotFieldNames.forEach(function (name) {
          var values = formData.getAll(name);
          if (values.length !== 1 || values[0] !== "") throw new Error("Verification failed. Please try again.");
        });
        if (capabilities.altchaEnabled && !formData.get("altcha")) {
          showState("error", messages.verificationRequired);
          return;
        }
        config.fields.forEach(function (field) {
          if (field.type === "checkbox" && (field.dataType === "boolean" || field.value === undefined)) {
            body.set(field.name, form.elements.namedItem(field.name).checked ? "true" : "false");
          } else {
            formData.getAll(field.name).forEach(function (value) {
              if (typeof value === "string" && value.trim() !== "") body.append(field.name, value);
            });
          }
        });
        // Protection controls must be retained even when their value is empty.
        formData.forEach(function (value, name) {
          if (!config.fields.some(function (field) { return field.name === name; }) && typeof value === "string") body.append(name, value);
        });
        var response = await fetch(sourceApiOrigin + "/api/submit/" + encodeURIComponent(config.sourceId), {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: body
        });
        var payload;
        try {
          payload = await response.json();
        } catch (_parseError) {
          payload = null;
        }
        if (response.ok && payload && payload.success === true) {
          form.reset();
          showState("success", messages.success);
        } else {
          if (response.status === 403) {
            var widget = form.querySelector("altcha-widget");
            if (widget && typeof widget.reset === "function") widget.reset();
            showState("error", messages.verificationFailed);
            return;
          }
          var safeError = payload && typeof payload.error === "string" ? payload.error.trim() : "";
          showState("error", config.messages && config.messages.error !== undefined ? messages.error : safeError && safeError.length <= 200 ? safeError : messages.error);
        }
      } catch (_requestError) {
        showState("error", messages.error);
      } finally {
        submit.disabled = false;
      }
    });

    if (config.autoOpen) openDialog();

    return {
      destroy: function () {
        if (trigger) trigger.removeEventListener("click", openDialog);
        close.removeEventListener("click", closeDialog);
        document.removeEventListener("keydown", onKeydown);
        root.remove();
      }
    };
  }

  async function create(config) {
    var error = validateConfig(config);
    if (error) {
      configurationError(error);
      return;
    }

    var sourceApiOrigin = config.apiBaseUrl === undefined ? apiOrigin : new URL(config.apiBaseUrl).origin;
    if (config.preview) {
      return buildWidget(config, { altchaEnabled: false, honeypotEnabled: false }, sourceApiOrigin);
    }

    try {
      var response = await fetch(sourceApiOrigin + "/api/submit/" + encodeURIComponent(config.sourceId));
      var capabilities = await response.json();
      if (!response.ok || !capabilities || typeof capabilities.altchaEnabled !== "boolean" || typeof capabilities.honeypotEnabled !== "boolean") {
        throw new Error("invalid capability response");
      }
      error = validateConfig(config);
      if (error) {
        configurationError(error);
        return;
      }
      return buildWidget(config, capabilities, sourceApiOrigin);
    } catch (_error) {
      console.error("Forman popup: unable to load this form. Check its ID and authorized domains.");
    }
  }

  function forman(command, config) {
    if (command !== "create") {
      configurationError("unsupported command ‘" + String(command) + "’; expected ‘create’. ");
      return;
    }
    return create(config);
  }

  forman.q = [];
  window.forman = forman;
  queuedCalls.forEach(function (queuedCall) {
    forman.apply(null, Array.prototype.slice.call(queuedCall));
  });
})();`;
