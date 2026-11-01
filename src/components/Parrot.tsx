export type ParrotMood = "idle" | "talking" | "happy" | "sleepy";

/**
 * Parrot, the mascot. Pure SVG; the mood only switches CSS animations
 * (bobbing, beak moving, hopping), which turn off with reduced motion.
 */
export function Parrot({ mood = "idle", size = 96 }: { mood?: ParrotMood; size?: number }) {
  return (
    <svg className={`parrot parrot-${mood}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Parrot">
      <g className="parrot-body">
        {/* tail */}
        <path d="M52 92 L38 118 L56 110 Z" fill="#e2483d" />
        <path d="M58 94 L54 120 L68 110 Z" fill="#2f6fdb" />
        {/* body and belly */}
        <ellipse cx="62" cy="76" rx="26" ry="30" fill="#3aa35b" />
        <ellipse cx="68" cy="84" rx="14" ry="19" fill="#a6d86e" />
        {/* wing */}
        <g className="parrot-wing">
          <ellipse cx="50" cy="78" rx="12" ry="21" fill="#2a7d47" transform="rotate(-14 50 78)" />
          <path d="M42 90 Q46 100 52 96" stroke="#f2c230" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
        {/* feet */}
        <path d="M58 104 v6 M68 104 v6" stroke="#f0a03a" strokeWidth="4" strokeLinecap="round" />
        <g className="parrot-head">
          {/* crest */}
          <path d="M62 22 Q58 8 66 12 Q66 4 72 12 Q76 6 76 18 Z" fill="#e2483d" />
          <circle cx="70" cy="40" r="22" fill="#3aa35b" />
          {/* face patch and eye */}
          <ellipse cx="77" cy="38" rx="9" ry="8.5" fill="#ffffff" />
          <g className="parrot-eye">
            <circle cx="78" cy="37.5" r="4.2" fill="#1c1c1a" />
            <circle cx="79.4" cy="36" r="1.4" fill="#ffffff" />
          </g>
          <circle cx="66" cy="48" r="4" fill="#ff7a9a" opacity="0.85" />
          {/* beak: the lower jaw moves when talking */}
          <path className="parrot-jaw" d="M85 47 C92 47 95 52 90 57 C88 55 86 52 84.5 50 Z" fill="#d9822b" />
          <path d="M84 36 C99 33 104 49 92 55 C94 48 90 44 85 47 Z" fill="#f2a33a" />
        </g>
      </g>
    </svg>
  );
}
