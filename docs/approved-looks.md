# Looks the design approves on purpose; the fresh-eyes checker is told not to report them

- Sheet action edges differ from field edges: the approved prototype uses 24px body gutters and 18px header/footer action gutters on desktop (20px body, 12px header and 14px footer on phone). Source: `redesign/design/prototype/assets/app.css`, `.sheet-head`, `.sheet-body`, `.sheet-foot`.
- A focused Close button has a 2.5px blue ring offset 2px outside the button; the ring can extend beyond the field edge while remaining inside the sheet. Source: `redesign/design/design-guide.md` §4.1.
- Sheets have a plain fixed title above an independently scrolling body, without a header divider in the approved prototype. Content can continue beyond that scroll boundary; captures must still show the labels of the controls they feature. Source: design guide §4.11 and prototype `.sheet-head`/`.sheet-body`.
