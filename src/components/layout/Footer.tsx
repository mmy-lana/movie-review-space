import Link from 'next/link';

/**
 * Application footer with brand context, navigation and the local-first notice.
 * Server component: it renders no interactive state and ships zero JavaScript.
 */

const FOOTER_SECTIONS = [
  {
    heading: 'Browse',
    links: [
      { href: '/films', label: 'Films' },
      { href: '/lists', label: 'Lists' },
      { href: '/diary', label: 'Diary' },
    ],
  },
  {
    heading: 'App',
    links: [
      { href: '/', label: 'Home' },
      { href: '/profile/deakins_ghost', label: 'Profile' },
      { href: '/films', label: 'Search' },
    ],
  },
] as const;

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-10 border-t border-border-subtle bg-surface-panel/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:flex-row sm:justify-between">
        <div className="max-w-sm">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="flex items-center gap-[3px]">
              <span className="h-2 w-2 rounded-full bg-brand-orange" />
              <span className="h-2 w-2 rounded-full bg-brand-green" />
              <span className="h-2 w-2 rounded-full bg-brand-cyan" />
            </span>
            <span className="font-serif text-sm font-bold text-text-primary">CineSlate</span>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
            A local-first film journal. Every rating, diary entry and list you create is stored
            in this browser&apos;s IndexedDB — nothing is uploaded anywhere.
          </p>

          <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-text-dim">
            CINE-SOCIAL-BOXD · {year}
          </p>
        </div>

        <nav aria-label="Footer" className="flex gap-10">
          {FOOTER_SECTIONS.map((section) => (
            <div key={section.heading}>
              <h2 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-text-dim">
                {section.heading}
              </h2>
              <ul className="mt-2 flex flex-col gap-1">
                {section.links.map((link) => (
                  <li key={`${section.heading}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-8 items-center text-[12px] text-text-muted transition-colors hover:text-text-secondary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export default Footer;
