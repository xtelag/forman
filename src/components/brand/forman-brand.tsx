import { FormanWordmark } from "@/components/brand/forman-wordmark";

export function FormanBrand() {
  return (
    <section aria-label="Forman" className="flex flex-col items-center text-center">
      <div className="leading-none [&_img]:h-12">
        <span className="sr-only">Forman</span>
        <FormanWordmark />
      </div>
    </section>
  );
}
