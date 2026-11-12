import { mergeAttributes, Node } from "@tiptap/core";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { type ImageSticker, parseStickersAttr } from "./image-sticker-types";
import { ResizableImageComponent } from "./resizable-image-node";

/**
 * 이미지 합치기 드래그(resizableImage → resizableImage / resizableImage → imageGallery)에
 * 사용되는 dataTransfer MIME 타입.
 *
 * 이미지 노드와 갤러리 노드 양쪽에서 동일한 값을 사용해야 하므로 한 곳에서만 정의.
 */
export const IMAGE_MERGE_MIME = "application/x-blogstudio-image-merge";

/**
 * 이미지 합치기 드래그 시 dataTransfer 에 직렬화되어 전달되는 페이로드.
 */
export interface ImageMergePayload {
  src: string;
  alt: string | null;
  title: string | null;
  /** 드래그 시작 시점의 노드 위치(ProseMirror pos) */
  fromPos: number;
  /** 드래그 시작 시점의 노드 nodeSize */
  fromSize: number;
}

/**
 * 갤러리 내부 이미지를 갤러리 밖으로 드래그하여 독립 이미지로 추출할 때
 * 사용되는 dataTransfer MIME 타입.
 *
 * 이 MIME 은 갤러리 → 에디터 공백 / 갤러리 → 단일 이미지 / 갤러리 → 다른 갤러리
 * 모두에서 동일하게 사용된다.
 */
export const IMAGE_GALLERY_EXTRACT_MIME =
  "application/x-blogstudio-gallery-extract";

/**
 * 갤러리 이미지 추출 드래그 시 dataTransfer 에 직렬화되어 전달되는 페이로드.
 */
export interface ImageGalleryExtractPayload {
  src: string;
  alt: string | null;
  title: string | null;
  /** 소스 갤러리 노드의 ProseMirror pos */
  fromGalleryPos: number;
  /** 소스 갤러리 내 이미지 인덱스 */
  fromGalleryIndex: number;
}

export interface ResizableImageOptions {
  inline: boolean;
  allowBase64: boolean;
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    resizableImage: {
      setResizableImage: (options: {
        src: string;
        alt?: string;
        title?: string;
        width?: number | string;
        height?: number | string;
      }) => ReturnType;
    };
  }
}

export const ResizableImage = Node.create<ResizableImageOptions>({
  name: "resizableImage",

  addOptions() {
    return {
      inline: false,
      allowBase64: true,
      HTMLAttributes: {},
    };
  },

  inline() {
    return this.options.inline;
  },

  group() {
    return this.options.inline ? "inline" : "block";
  },

  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute("width") || element.style.width;
          return width ? parseInt(width, 10) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.width) {
            return {};
          }
          return {
            width: attributes.width,
          };
        },
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const height = element.getAttribute("height") || element.style.height;
          return height ? parseInt(height, 10) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.height) {
            return {};
          }
          return {
            height: attributes.height,
          };
        },
      },
      align: {
        default: "center",
        parseHTML: (element) => element.getAttribute("data-align") || "center",
        renderHTML: (attributes) => ({
          "data-align": attributes.align,
        }),
      },
      /** 이미지 위 이모티콘 스티커 목록 — HTML 직렬화는 node renderHTML 에서 처리 */
      stickers: {
        default: [],
        parseHTML: (element) =>
          parseStickersAttr(element.getAttribute("data-stickers")),
        renderHTML: () => ({}),
      },
      /** 이미지 아래 작은 설명 텍스트 — HTML 직렬화는 node renderHTML 에서 처리 */
      caption: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-caption") || "",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        // 스티커/캡션이 붙은 이미지 래퍼 (renderHTML 출력 형태)
        tag: 'div[data-type="image-with-stickers"]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          const img = el.querySelector("img");
          if (!img) return false;
          const width = img.getAttribute("width");
          const height = img.getAttribute("height");
          return {
            src: img.getAttribute("src"),
            alt: img.getAttribute("alt"),
            title: img.getAttribute("title"),
            width: width ? parseInt(width, 10) : null,
            height: height ? parseInt(height, 10) : null,
            align:
              el.getAttribute("data-align") ||
              img.getAttribute("data-align") ||
              "center",
            stickers: parseStickersAttr(el.getAttribute("data-stickers")),
            caption: el.getAttribute("data-caption") || "",
          };
        },
      },
      {
        tag: "img[src]",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const stickers = (node.attrs.stickers ?? []) as ImageSticker[];
    const caption = ((node.attrs.caption as string) || "").trim();
    const img: DOMOutputSpec = [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
    ];

    if (stickers.length === 0 && !caption) {
      return img;
    }

    // 스티커/캡션이 있으면 래퍼로 출력 — 아티클 뷰에서 CSS/JS 없이 그대로 보인다.
    // SVG text 는 width(%) 에 따라 스케일되므로 이미지 크기에 비례해 함께 커지고 작아진다.
    const align = (node.attrs.align as string) || "center";
    const margin =
      align === "right"
        ? "1.5rem 0 1.5rem auto"
        : align === "left"
          ? "1.5rem auto 1.5rem 0"
          : "1.5rem auto";

    const stickerSpecs: DOMOutputSpec[] = stickers.map((s) => [
      "svg",
      {
        viewBox: "0 0 100 100",
        "data-image-sticker": s.id,
        style: `position:absolute;left:${s.x}%;top:${s.y}%;width:${s.size}%;transform:translate(-50%,-50%);overflow:visible;pointer-events:none;user-select:none;`,
      },
      [
        "text",
        {
          x: "50",
          y: "50",
          "font-size": "84",
          "text-anchor": "middle",
          "dominant-baseline": "central",
        },
        s.emoji,
      ],
    ]);

    // 스티커 좌표(%)의 기준이 이미지가 되도록 이미지+스티커만 감싸는 내부 래퍼
    const imageBox: DOMOutputSpec = [
      "div",
      { style: "position:relative;line-height:0;" },
      img,
      ...stickerSpecs,
    ];

    const captionSpecs: DOMOutputSpec[] = caption
      ? [
          [
            "div",
            {
              "data-image-caption": "",
              style:
                "margin-top:8px;font-size:0.8125rem;line-height:1.5;color:#8a8a8a;text-align:center;",
            },
            caption,
          ],
        ]
      : [];

    return [
      "div",
      {
        "data-type": "image-with-stickers",
        "data-align": align,
        "data-stickers": JSON.stringify(stickers),
        "data-caption": caption,
        style: `position:relative;display:block;width:fit-content;max-width:100%;margin:${margin};`,
      },
      imageBox,
      ...captionSpecs,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },

  addCommands() {
    return {
      setResizableImage:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});

export default ResizableImage;
