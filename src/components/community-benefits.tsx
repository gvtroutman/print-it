import { CommunityBenefitMedia } from "@/components/community-benefit-media";
import { NavIcon, type NavIconName } from "@/components/nav-icons";

const MEDIA = "/printers/h2d-benefits";

// Photos and animations from https://bambulab.com/en/h2d.
// Original asset URLs and creator credits are in public/printers/h2d-benefits/sources.json.
// The campaign is the Laser Full Combo (40W); print volume below is the dual-nozzle area.
const BENEFITS: {
  title: string;
  description: string;
  icon: NavIconName;
  image: string;
  alt: string;
  video?: string;
  credit?: string;
}[] = [
  {
    title: "40W laser engraving & cutting",
    icon: "laser",
    description: "Make personalized signs, engraved gifts and cut components from laser-compatible materials such as wood.",
    image: "laser",
    alt: "Laser-cut wooden automata with moving butterflies and flowers, featured on Bambu Lab’s H2D website.",
    credit: "Automata by Ross McSweeney",
  },
  {
    title: "Blade cutting",
    icon: "blade",
    description: "Cut paper, vinyl and sticker sheets for labels, stencils and craft projects with the included cutting module.",
    image: "blade",
    alt: "A colorful paper birthday card with intricate cut-out flowers, featured on Bambu Lab’s H2D website.",
    credit: "Birthday card by popupcardKagisippo",
  },
  {
    title: "Pen drawing",
    icon: "pencil",
    description: "Plot line art, lettering and technical drawings on paper with the cutting module’s pen holder.",
    image: "pen",
    alt: "The H2D pen holder drawing bold comic-style lettering on paper.",
  },
  {
    title: "Larger 3D prints",
    icon: "cube",
    description: "A 300 × 320 × 325 mm dual-nozzle build area gives us more room than the P1S’s 256 × 256 × 256 mm for organizers, enclosures and prototypes.",
    image: "build-volume",
    video: "build-volume",
    alt: "Bambu Lab’s animation of the H2D printer and its expanded build area.",
  },
  {
    title: "Save filament on multicolor prints",
    icon: "spool",
    description: "One complex multicolor P1S print can waste around 500g — half a 1kg roll. The H2D can sharply reduce that waste by keeping two compatible colors or materials in separate nozzles. Additional AMS filament swaps can still create waste.",
    image: "multicolor",
    alt: "A detailed red, gray and black 3D-printed model car, shown as an H2D multicolor printing example.",
    credit: "Tesla Model S Plaid by Mr.Rod",
  },
  {
    title: "Faster multicolor turnaround",
    icon: "rabbit",
    description: "Repeated unload, reload and purge cycles can make P1S jobs with frequent color changes take significantly longer — sometimes around twice as long as comparable H2D two-color prints. Switching between loaded nozzles reduces these delays; savings vary by model and settings.",
    image: "dual-nozzle",
    video: "dual-nozzle",
    alt: "Bambu Lab’s animation showing the H2D dual-nozzle switching mechanism.",
  },
];

export function CommunityBenefits() {
  return (
    <section aria-labelledby="community-capabilities" className="community-benefits">
      <header className="community-benefits-sign">
        <img src="/community-benefits-theater.svg" alt="" aria-hidden="true" width={600} height={400} className="community-benefits-sign-artwork" />
        <h2 id="community-capabilities" className="community-benefits-sign-title">
          <span className="sr-only">BENEFITS</span>
          <img src="/benefits-cooper-black.svg" alt="" aria-hidden="true" width={473} height={98} className="community-benefits-sign-lettering" />
        </h2>
      </header>
      <div className="community-benefits-content">
        <p className="m-0 text-[14.5px] leading-[1.5] text-cream text-pretty">
          Once funded and set up, the H2D Laser Full Combo (40W) will make these capabilities available for community projects.
        </p>
        <ul className="m-0 mt-[17.6px] grid list-none gap-x-[26.4px] gap-y-[22px] p-0 sm:grid-cols-2">
          {BENEFITS.map((benefit) => (
            <li key={benefit.title} className="min-w-0">
              <CommunityBenefitMedia image={`${MEDIA}/${benefit.image}.webp`} video={benefit.video ? `${MEDIA}/${benefit.video}.mp4` : undefined} alt={benefit.alt} credit={benefit.credit} />
              <h3 className="m-0 mt-[10px] flex items-start gap-[8px] font-display text-[18px] leading-[1.25] text-cream">
                <span className="flex h-[22.5px] shrink-0 items-center text-ink"><NavIcon name={benefit.icon} size={36} /></span>
                <span className="min-w-0">{benefit.title}</span>
              </h3>
              <p className="m-0 mt-[6px] text-[14px] leading-[1.5] text-cream text-pretty">{benefit.description}</p>
            </li>
          ))}
        </ul>
        <p className="m-0 mt-[22px] border-t-2 border-dashed border-cream/40 pt-[13.2px] text-[12px] leading-[1.5] text-cream">
          Images and animations from{" "}
          <a href="https://bambulab.com/en/h2d" target="_blank" rel="noreferrer noopener" className="font-bold underline underline-offset-2 hover:decoration-2 focus-visible:outline-cream">Bambu Lab’s H2D website ↗</a>.
        </p>
      </div>
      <div className="community-benefits-stage" aria-hidden="true" />
    </section>
  );
}
