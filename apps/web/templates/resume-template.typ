// Vendored from ghosted/ats-job-docs/assets/resume-template.typ — keep in sync.
// Original: https://github.com/celloopa/ghosted — MIT license (same author).
// ATS-safe resume template — single column, plain structure, extraction-friendly.
// Rules encoded here (keep them if you restyle):
//  - no tables/grids/columns for layout
//  - standard headings: Experience, Skills, Education (Projects optional)
//  - ligatures OFF, hyphenation OFF
//  - no critical info in headers/footers, no text-in-images

#set page(paper: "us-letter", margin: (x: 0.75in, y: 0.7in))
#set text(font: "Libertinus Serif", size: 10.5pt, ligatures: false, hyphenate: false)
#set par(justify: false, leading: 0.55em)

// ---- DATA (replace with tailored content from cv.json) ----
#let name = "Marcelo Rondon"
#let title = "Product Designer / Design Engineer"
#let email = "cello@cello.design"
#let phone = "(305) 496-0039"
#let location = "Portland, OR"
#let links = "cello.design · github.com/celloopa · linkedin.com/in/marcelorondon"
#let summary = "TAILORED SUMMARY LINE GOES HERE — mirror the posting's language, truthfully."

// ---- HEADER ----
#align(center)[
  #text(size: 18pt, weight: "bold")[#name] \
  #text(size: 11pt)[#title] \
  #text(size: 9.5pt)[#location · #email · #phone] \
  #text(size: 9.5pt)[#links]
]
#v(4pt)
#summary
#v(6pt)

// ---- SECTION HELPERS ----
#let section(heading) = {
  v(6pt)
  text(size: 12pt, weight: "bold")[#heading]
  line(length: 100%, stroke: 0.5pt)
  v(2pt)
}

#let role(company, position, dates, loc, bullets) = {
  text(weight: "bold")[#company] + text[ — #position]
  linebreak()
  text(size: 9.5pt, style: "italic")[#dates · #loc]
  for b in bullets [
    - #b
  ]
  v(4pt)
}

// ---- EXPERIENCE ----
#section("Experience")
#role(
  "Asheville Dispensary", "Product Design Lead / Design Engineer",
  "2022 – Present", "Remote",
  (
    "Tailored bullet 1 — lead with the most posting-relevant, quantified outcome.",
    "Tailored bullet 2.",
    "Tailored bullet 3.",
  ),
)
// ...more roles from cv.json, bullets reordered per posting

// ---- SKILLS ----
#section("Skills")
Reordered, comma-separated skills from cv.json — most posting-relevant first.

// ---- PROJECTS (optional) ----
#section("Projects")
#text(weight: "bold")[Ghosted] — one line, with the most relevant detail for this posting.

// ---- EDUCATION ----
#section("Education")
#text(weight: "bold")[University of Florida] — Visual Journalism & Communications, Minor: Digital Arts & Sciences (2016 – 2019)
