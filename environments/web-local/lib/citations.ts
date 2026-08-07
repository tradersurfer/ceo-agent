/**
 * Cleans up `<cite>`-shaped fragments a model may emit unprompted in chat
 * text -- no PROMPT.md/BEHAVIOR.md anywhere in this codebase instructs any
 * agent to use this or any other citation-tag syntax (every reference to
 * "citation" in doctrine is a warning against inventing one), and
 * core/skills/webSearchSkill.js's underlying PerplexityClient deliberately
 * uses the citation-free /search endpoint, not the prose-with-citations
 * Sonar API -- so this is defensive cleanup of unprompted model output, not
 * a documented app feature.
 *
 * ChatView.tsx renders agent text through react-markdown with only
 * remark-gfm (no rehype-raw), so raw HTML is never executed -- a stray
 * `<cite>` tag just renders as literal, visible tag syntax. This module
 * runs BEFORE react-markdown sees the text, converting the tag into plain
 * markdown emphasis (`*inner text*`) so the citation reads as normal
 * styled text instead of leaking raw markup.
 *
 * Deliberately narrow: only the `<cite>` tag is recognized. Adding
 * rehype-raw would let react-markdown render ANY HTML a model outputs
 * (unsanitized model text becoming live DOM/attributes is a real injection
 * surface); a targeted string transform for the one tag this project has
 * actually observed is the narrower, safer fix. Legitimate content that
 * happens to contain angle brackets (code blocks, generics like `Array<T>`,
 * comparisons) is left untouched -- this does not do general HTML
 * stripping.
 */

const CITE_PAIR_RE = /<cite\b[^>]*>([\s\S]*?)<\/cite>/gi;
const CITE_SELF_CLOSING_RE = /<cite\b[^>]*\/?>/gi;

/**
 * Converts `<cite>...</cite>` fragments into markdown emphasis, and
 * removes any leftover unclosed/self-closing `<cite>` tag. Leaves every
 * other character of the input untouched.
 */
export function sanitizeCitations(text: string): string {
  if (typeof text !== 'string' || !text) return text;
  return text
    .replace(CITE_PAIR_RE, (_match, inner) => {
      const cleaned = inner.replace(/\s+/g, ' ').trim();
      return cleaned ? `*${cleaned}*` : '';
    })
    .replace(CITE_SELF_CLOSING_RE, '');
}
