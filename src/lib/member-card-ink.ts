// Rasterize the stationary ink once; animation only composites the cached mask.
const images = new Map<string, Promise<HTMLImageElement>>();

function loadImage(source: string) {
  let image = images.get(source);
  if (!image) {
    image = new Promise<HTMLImageElement>((resolve, reject) => {
      const asset = new Image();
      asset.onload = () => resolve(asset);
      asset.onerror = () => { images.delete(source); reject(new Error("Card artwork unavailable")); };
      asset.src = source;
    });
    images.set(source, image);
  }
  return image;
}

type InkLayout = Map<Element, { x: number; y: number; width: number; height: number }>;

// Read the stationary card layout once when its size or content changes.
function measure(face: HTMLElement): InkLayout {
  const origin = face.getBoundingClientRect();
  return new Map([face, ...face.querySelectorAll("*")].map(element => {
    const rect = element.getBoundingClientRect();
    return [element, { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height }];
  }));
}

function roundedBox(context: CanvasRenderingContext2D, element: HTMLElement, layout: InkLayout, shadow = false) {
  const { x, y, width, height } = layout.get(element)!;
  const style = getComputedStyle(element);
  const border = parseFloat(style.borderTopWidth) || 0;
  const radiusValue = parseFloat(style.borderTopLeftRadius) || 0;
  const radius = Math.min(style.borderTopLeftRadius.endsWith("%") ? Math.min(width, height) * radiusValue / 100 : radiusValue, width / 2, height / 2);
  if (shadow) {
    const offsets = style.boxShadow.match(/-?[\d.]+px/g)?.map(parseFloat) ?? [0, 0];
    context.fillStyle = style.borderTopColor;
    context.beginPath();
    context.roundRect(x + offsets[0], y + offsets[1], width, height, radius);
    context.fill();
  }
  context.fillStyle = style.backgroundColor;
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
  if (border) {
    context.strokeStyle = style.borderTopColor;
    context.lineWidth = border;
    context.beginPath();
    context.roundRect(x + border / 2, y + border / 2, width - border, height - border, Math.max(0, radius - border / 2));
    context.stroke();
  }
}

function text(context: CanvasRenderingContext2D, element: HTMLElement, layout: InkLayout, centered = false) {
  const rect = layout.get(element)!;
  const style = getComputedStyle(element);
  context.save();
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  context.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
  context.fillStyle = style.color;
  context.textBaseline = "alphabetic";
  let value = element.textContent ?? "";
  if (style.textTransform === "uppercase") value = value.toUpperCase();
  const left = parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
  const right = parseFloat(style.paddingRight) + parseFloat(style.borderRightWidth);
  const available = rect.width - left - right;
  if (style.textOverflow === "ellipsis" && context.measureText(value).width > available) {
    const characters = Array.from(value);
    while (characters.length && context.measureText(characters.join("") + "…").width > available) characters.pop();
    value = characters.join("") + "…";
  }
  const metrics = context.measureText(value);
  const ascent = metrics.fontBoundingBoxAscent;
  const descent = metrics.fontBoundingBoxDescent;
  const x = centered ? rect.x + (rect.width - metrics.width) / 2 : rect.x + left;
  const y = rect.y + (rect.height - ascent - descent) / 2 + ascent;
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
  context.fillText(value, x, y);
  context.restore();
}

export async function memberCardInkMask(face: HTMLElement): Promise<string> {
  await document.fonts.ready;
  const layout = measure(face);
  const bounds = layout.get(face)!;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(bounds.width * scale);
  canvas.height = Math.ceil(bounds.height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Card mask unavailable");
  context.scale(canvas.width / bounds.width, canvas.height / bounds.height);
  const style = getComputedStyle(face);
  const border = parseFloat(style.borderTopWidth);
  context.strokeStyle = style.borderTopColor;
  context.lineWidth = border;
  context.beginPath();
  context.roundRect(border / 2, border / 2, bounds.width - border, bounds.height - border,
    Math.max(0, parseFloat(style.borderTopLeftRadius) - border / 2));
  context.stroke();

  for (const element of face.querySelectorAll<HTMLElement>("[data-card-ink]")) {
    const kind = element.dataset.cardInk;
    if (kind === "text" || kind === "badge") {
      if (kind === "badge") roundedBox(context, element, layout);
      text(context, element, layout);
    } else if (kind === "logo" || kind === "avatar") {
      const rect = layout.get(element)!;
      const source = kind === "logo"
        ? element.querySelector("img")?.src
        : element.querySelector("image")?.getAttribute("href");
      if (source) {
        const image = await loadImage(source);
        context.filter = kind === "logo" ? "brightness(0)" : "none";
        context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
        context.filter = "none";
      } else {
        const initials = element.firstElementChild?.firstElementChild as HTMLElement | undefined;
        if (initials) { roundedBox(context, initials, layout); text(context, initials, layout, true); }
      }
    } else if (kind === "switch") {
      const button = element.querySelector("button");
      if (!button) continue;
      roundedBox(context, button, layout, true);
      const icon = button.querySelector("svg");
      if (!icon) continue;
      const copy = icon.cloneNode(true) as SVGSVGElement;
      copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      copy.setAttribute("stroke", getComputedStyle(icon).color);
      const width = icon.clientWidth, height = icon.clientHeight;
      copy.setAttribute("width", String(width));
      copy.setAttribute("height", String(height));
      const source = "data:image/svg+xml," + encodeURIComponent(new XMLSerializer().serializeToString(copy));
      // The switch icon is tiny and can change during submission; do not retain it in the asset cache.
      const image = await loadImage(source);
      const rect = layout.get(button)!;
      context.drawImage(image, rect.x + (rect.width - width) / 2, rect.y + (rect.height - height) / 2, width, height);
      images.delete(source);
    }
  }
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const luminance = (.2126 * pixels.data[index] + .7152 * pixels.data[index + 1] + .0722 * pixels.data[index + 2]) / 255;
    // Discard translucent edge pixels that would be light once printed on the card.
    const coverage = pixels.data[index + 3] / 255;
    const printedLuminance = luminance * coverage + .75 * (1 - coverage);
    pixels.data[index + 3] = 255 * Math.max(0, Math.min(1, (0.24 - printedLuminance) / 0.08));
    pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL();
}
