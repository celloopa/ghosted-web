import { describe, it, expect } from 'vitest'
import { parsePostingHTML } from '../src/index'

const GREENHOUSE_HTML = `<!DOCTYPE html>
<html><head>
<title>Design Engineer - Figma | Careers</title>
<meta property="og:title" content="Design Engineer" />
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  "title": "Design Engineer",
  "hiringOrganization": { "@type": "Organization", "name": "Figma" },
  "jobLocation": [{ "@type": "Place", "address": { "addressLocality": "San Francisco", "addressRegion": "CA" } }],
  "jobLocationType": "TELECOMMUTE",
  "baseSalary": { "@type": "MonetaryAmount", "currency": "USD",
    "value": { "@type": "QuantitativeValue", "minValue": 149000, "maxValue": 188000, "unitText": "YEAR" } },
  "description": "<p>Build <b>design systems</b> with React and TypeScript.</p><ul><li>Ship UI</li></ul>"
}
</script>
<style>.x{color:red}</style>
</head><body>
<script>var tracking = 1;</script>
<h1>Design Engineer</h1>
<div>We need React, TypeScript, Figma mastery. Accessibility (WCAG) required.</div>
</body></html>`

describe('parsePostingHTML — deterministic, JSON-LD first', () => {
  const facts = parsePostingHTML(GREENHOUSE_HTML, 'https://boards.greenhouse.io/figma/jobs/123')

  it('extracts company and position from schema.org JobPosting', () => {
    expect(facts.company).toBe('Figma')
    expect(facts.position).toBe('Design Engineer')
  })

  it('extracts salary, location, remote from JSON-LD', () => {
    expect(facts.salary_min).toBe(149000)
    expect(facts.salary_max).toBe(188000)
    expect(facts.location).toContain('San Francisco')
    expect(facts.remote).toBe(true)
  })

  it('derives source from the url', () => {
    expect(facts.source).toBe('greenhouse')
  })

  it('produces readable description text, scripts and styles stripped', () => {
    expect(facts.description).toContain('design systems')
    expect(facts.description).toContain('Accessibility')
    expect(facts.description).not.toContain('tracking')
    expect(facts.description).not.toContain('color:red')
    expect(facts.description).not.toContain('<p>')
  })

  it('handles @graph-wrapped JSON-LD', () => {
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":"JobPosting","title":"Brand Designer","hiringOrganization":{"name":"Acme"}}]}
    </script></head><body>text body here for the description fallback</body></html>`
    const f = parsePostingHTML(html)
    expect(f.position).toBe('Brand Designer')
    expect(f.company).toBe('Acme')
  })

  it('falls back to title-tag heuristics without JSON-LD', () => {
    const html = `<html><head><title>Senior Product Designer - Stripe</title></head>
      <body><h1>Senior Product Designer</h1><p>Salary: $150k–$190k. Remote friendly. Figma, prototyping.</p></body></html>`
    const f = parsePostingHTML(html)
    expect(f.position).toBe('Senior Product Designer')
    expect(f.company).toBe('Stripe')
    expect(f.salary_min).toBe(150000)
    expect(f.salary_max).toBe(190000)
    expect(f.remote).toBe(true)
  })

  it('treats plain pasted text as description, never throws', () => {
    const f = parsePostingHTML('Just a pasted job description. React and Figma.')
    expect(f.description).toContain('pasted job description')
    expect(f.company).toBeUndefined()
  })

  it('survives malformed JSON-LD', () => {
    const html = `<html><head><script type="application/ld+json">{not json</script></head><body>ok body</body></html>`
    expect(() => parsePostingHTML(html)).not.toThrow()
  })

  it('caps the description length', () => {
    const f = parsePostingHTML('<html><body>' + 'word '.repeat(20000) + '</body></html>')
    expect(f.description.length).toBeLessThanOrEqual(20000)
  })

  it('decodes basic HTML entities', () => {
    const f = parsePostingHTML('<html><body>Design &amp; build &quot;things&quot; &#39;fast&#39;</body></html>')
    expect(f.description).toContain('Design & build "things" \'fast\'')
  })
})
