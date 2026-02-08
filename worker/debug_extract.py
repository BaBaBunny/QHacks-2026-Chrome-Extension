"""Quick diagnostic: dump all text elements fitz extracts, highlighting white text and overlaps."""
import sys
import fitz

def dump(pdf_path):
    doc = fitz.open(pdf_path)
    for page_num in range(len(doc)):
        page = doc[page_num]
        page_h = page.rect.height
        print(f"\n{'='*80}")
        print(f"PAGE {page_num + 1}  ({page.rect.width:.0f} x {page_h:.0f})")
        print(f"{'='*80}")

        text_dict = page.get_text("dict")
        elements = []

        for block in text_dict.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                line_text = ""
                first_span = None
                for span in line.get("spans", []):
                    if not span.get("text", "").strip():
                        continue
                    if first_span is None:
                        first_span = span
                    line_text += span.get("text", "")

                if not line_text.strip() or first_span is None:
                    continue

                bbox = line.get("bbox", (0, 0, 0, 0))
                color_int = first_span.get("color", 0)
                r = ((color_int >> 16) & 0xFF) / 255.0
                g = ((color_int >> 8) & 0xFF) / 255.0
                b = (color_int & 0xFF) / 255.0

                elements.append({
                    "text": line_text.strip(),
                    "x": bbox[0],
                    "y": bbox[1],
                    "y1": bbox[3],
                    "font": first_span.get("font", "?"),
                    "size": first_span.get("size", 0),
                    "color": (r, g, b),
                })

        # Sort by Y
        elements.sort(key=lambda e: (e["y"], e["x"]))

        prev_y1 = 0
        for e in elements:
            is_white = min(e["color"]) > 0.9
            overlap = e["y"] < prev_y1 - 1  # overlaps with previous element
            flags = []
            if is_white:
                flags.append("WHITE")
            if overlap:
                flags.append(f"OVERLAP(prev_bottom={prev_y1:.1f})")

            flag_str = f"  *** {' | '.join(flags)} ***" if flags else ""
            print(f"  y={e['y']:6.1f}-{e['y1']:6.1f}  x={e['x']:5.1f}  size={e['size']:5.1f}  "
                  f"color=({e['color'][0]:.2f},{e['color'][1]:.2f},{e['color'][2]:.2f})  "
                  f"font={e['font']:<20s}  '{e['text'][:60]}'{flag_str}")
            prev_y1 = e["y1"]

    doc.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python debug_extract.py <pdf_path>")
        sys.exit(1)
    dump(sys.argv[1])
