import Image from "next/image";

export function FacilityPhoto() {
  return (
    <figure className="relative isolate min-h-56 overflow-hidden rounded-[24px] border border-white/15 bg-brand sm:min-h-80 lg:min-h-[29rem]">
      <Image
        src="/facilities/illustrative-pitch.webp"
        alt="A soccer field with a goal, floodlights and painted touchlines at sunset"
        fill
        loading="eager"
        sizes="(min-width: 1280px) 630px, (min-width: 1024px) 52vw, 100vw"
        className="object-cover object-[58%_50%]"
      />
      <figcaption className="absolute bottom-3 left-3 rounded-full bg-ink/90 px-3 py-1.5 text-xs text-white sm:bottom-4 sm:left-4">
        Illustrative field image
      </figcaption>
    </figure>
  );
}
