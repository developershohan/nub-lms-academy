# Certificate fonts

Used by `src/lib/certificate-pdf.ts`. pdf-lib's standard fonts (Helvetica etc.) only cover
WinAnsi, so they can't draw Bengali names or course titles.

| File | Source |
| --- | --- |
| `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf` | [notofonts/latin-greek-cyrillic](https://github.com/notofonts/latin-greek-cyrillic) unhinted TTF, subset (see below) |
| `NotoSansBengali-Regular.ttf`, `NotoSansBengali-Bold.ttf` | [notofonts/bengali](https://github.com/notofonts/bengali) unhinted TTF, unmodified |

The Noto Sans files were cut down to Latin, punctuation and currency symbols with fontTools:

```bash
pyftsubset NotoSans-Regular.ttf --unicodes="U+0020-007E,U+00A0-024F,U+2000-206F,U+20A0-20CF,U+2122,U+2190-2193,U+FFFD" --layout-features='*' --notdef-outline
```

Besides shrinking them from ~430 KB to ~80 KB, re-saving through fontTools pads every glyph to
an even length. That matters: pdf-lib's font subsetter (@pdf-lib/fontkit) writes a short `loca`
table, which halves glyph offsets, so the upstream file's odd-length glyphs came out as missing
or garbled letters. Re-run the same command if these files are ever replaced.

All four fonts are licensed under the SIL Open Font License 1.1 (see `OFL.txt`).
