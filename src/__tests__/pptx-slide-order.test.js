// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { PptxExtractor } from "../data/pptx-extractor.js";

// ---------------------------------------------------------------------------
// Minimal PPTX scaffolding (enough for pptxtojson.parse + #extractSlideOrder)
// ---------------------------------------------------------------------------

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const PN = "http://schemas.openxmlformats.org/presentationml/2006/main";
const AN = "http://schemas.openxmlformats.org/drawingml/2006/main";
const RN = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT = "http://schemas.openxmlformats.org/package/2006/content-types";
const XMLNS = `xmlns:a="${AN}" xmlns:r="${RN}" xmlns:p="${PN}"`;

function contentTypes(slideNums) {
  const slides = slideNums
    .map(
      (n) =>
        `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
    .join("");
  return (
    XML_HEADER +
    `<Types xmlns="${CT}">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
    slides +
    `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
    `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
    `</Types>`
  );
}

function rootRels() {
  return (
    XML_HEADER +
    `<Relationships xmlns="${RELS}">` +
    `<Relationship Id="rId1" Type="${RN}/officeDocument" Target="ppt/presentation.xml"/>` +
    `</Relationships>`
  );
}

/**
 * Build presentation.xml with a custom <p:sldIdLst> order.
 * @param {Array<{id: number, rId: string}>} sldIds - entries in presentation order
 */
function presentationXml(sldIds) {
  const ids = sldIds.map((s) => `<p:sldId id="${s.id}" r:id="${s.rId}"/>`).join("");
  return (
    XML_HEADER +
    `<p:presentation ${XMLNS} saveSubsetFonts="1" autoCompressPictures="0">` +
    `<p:sldMasterIdLst><p:sldMasterId id="2147483660" r:id="rId1"/></p:sldMasterIdLst>` +
    `<p:sldIdLst>${ids}</p:sldIdLst>` +
    `<p:sldSz cx="9144000" cy="5143500"/>` +
    `<p:notesSz cx="6858000" cy="9144000"/>` +
    `</p:presentation>`
  );
}

/**
 * Build presentation.xml.rels mapping rIds to slide file paths.
 * @param {Array<{rId: string, fileNum: number}>} slideRels
 */
function presentationRels(slideRels) {
  const slides = slideRels
    .map(
      (s) =>
        `<Relationship Id="${s.rId}" Type="${RN}/slide" Target="slides/slide${s.fileNum}.xml"/>`,
    )
    .join("");
  return (
    XML_HEADER +
    `<Relationships xmlns="${RELS}">` +
    `<Relationship Id="rId1" Type="${RN}/slideMaster" Target="slideMasters/slideMaster1.xml"/>` +
    `<Relationship Id="rId2" Type="${RN}/theme" Target="theme/theme1.xml"/>` +
    slides +
    `</Relationships>`
  );
}

function masterXml() {
  const spTree =
    `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>`;
  return (
    XML_HEADER +
    `<p:sldMaster ${XMLNS}>${spTree}` +
    `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    `<p:sldLayoutIdLst><p:sldLayoutId id="2147483661" r:id="rId1"/></p:sldLayoutIdLst>` +
    `</p:sldMaster>`
  );
}

function masterRels() {
  return (
    XML_HEADER +
    `<Relationships xmlns="${RELS}">` +
    `<Relationship Id="rId1" Type="${RN}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
    `<Relationship Id="rId2" Type="${RN}/theme" Target="../theme/theme1.xml"/>` +
    `</Relationships>`
  );
}

function layoutXml() {
  const spTree =
    `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>`;
  return (
    XML_HEADER +
    `<p:sldLayout ${XMLNS} type="blank">${spTree}` +
    `<p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>` +
    `</p:sldLayout>`
  );
}

function layoutRels() {
  return (
    XML_HEADER +
    `<Relationships xmlns="${RELS}">` +
    `<Relationship Id="rId1" Type="${RN}/slideMaster" Target="../slideMasters/slideMaster1.xml"/>` +
    `</Relationships>`
  );
}

function themeXml() {
  return (
    XML_HEADER +
    `<a:theme xmlns:a="${AN}" name="Office Theme"><a:themeElements>` +
    `<a:clrScheme name="Blue"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>` +
    `<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="17406D"/></a:dk2>` +
    `<a:lt2><a:srgbClr val="DBEFF9"/></a:lt2><a:accent1><a:srgbClr val="0F6FC6"/></a:accent1>` +
    `<a:accent2><a:srgbClr val="009DD9"/></a:accent2><a:accent3><a:srgbClr val="0BD0D9"/></a:accent3>` +
    `<a:accent4><a:srgbClr val="10CF9B"/></a:accent4><a:accent5><a:srgbClr val="7CCA62"/></a:accent5>` +
    `<a:accent6><a:srgbClr val="A5C249"/></a:accent6><a:hlink><a:srgbClr val="F49100"/></a:hlink>` +
    `<a:folHlink><a:srgbClr val="85DFD0"/></a:folHlink></a:clrScheme>` +
    `<a:fontScheme name="Arial"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
    `</a:themeElements></a:theme>`
  );
}

function slideRels() {
  return (
    XML_HEADER +
    `<Relationships xmlns="${RELS}">` +
    `<Relationship Id="rId1" Type="${RN}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
    `</Relationships>`
  );
}

/** Minimal slide XML with a single text box containing `text`. */
function slideXml(text) {
  const body = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9144000" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="4400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:rPr><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
  return (
    XML_HEADER +
    `<p:sld ${XMLNS}><p:cSld><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    body +
    `</p:spTree></p:cSld></p:sld>`
  );
}

/**
 * Build a minimal PPTX ArrayBuffer.
 * @param {object} opts
 * @param {Array<{fileNum: number, text: string}>} opts.slides - slide files to create
 * @param {Array<{id: number, rId: string, fileNum: number}>} [opts.sldIdLst] - presentation order (rId → fileNum mapping). If omitted, falls back to filename order.
 */
async function buildPptx({ slides, sldIdLst = null }) {
  const zip = new JSZip();
  const FIXED_DATE = new Date(0);
  const add = (path, content) => zip.file(path, content, { date: FIXED_DATE });

  const fileNums = slides.map((s) => s.fileNum);
  add("[Content_Types].xml", contentTypes(fileNums));
  add("_rels/.rels", rootRels());

  if (sldIdLst) {
    add("ppt/presentation.xml", presentationXml(sldIdLst));
    add(
      "ppt/_rels/presentation.xml.rels",
      presentationRels(sldIdLst.map((s) => ({ rId: s.rId, fileNum: s.fileNum }))),
    );
  } else {
    // Default: filename order
    const defaultSldIds = slides.map((s, i) => ({
      id: 260 + i * 64,
      rId: `rId${3 + i}`,
      fileNum: s.fileNum,
    }));
    add("ppt/presentation.xml", presentationXml(defaultSldIds));
    const defaultRels = slides.map((s, i) => ({ rId: `rId${3 + i}`, fileNum: s.fileNum }));
    add("ppt/_rels/presentation.xml.rels", presentationRels(defaultRels));
  }

  add("ppt/theme/theme1.xml", themeXml());
  add("ppt/slideMasters/slideMaster1.xml", masterXml());
  add("ppt/slideMasters/_rels/slideMaster1.xml.rels", masterRels());
  add("ppt/slideLayouts/slideLayout1.xml", layoutXml());
  add("ppt/slideLayouts/_rels/slideLayout1.xml.rels", layoutRels());

  for (const slide of slides) {
    add(`ppt/slides/slide${slide.fileNum}.xml`, slideXml(slide.text));
    add(`ppt/slides/_rels/slide${slide.fileNum}.xml.rels`, slideRels());
  }

  for (const entry of Object.values(zip.files)) {
    entry.date = FIXED_DATE;
  }

  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

/** Get the text content from a slide's first text element (strips markdown heading prefix). */
function slideText(slide) {
  const textEl = slide.elements?.find((e) => e.type === "text");
  return (textEl?.content || "")
    .trim()
    .replace(/^#+\s*/, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PptxExtractor slide order", () => {
  it("preserves filename order when sldIdLst matches filename order", async () => {
    const buffer = await buildPptx({
      slides: [
        { fileNum: 1, text: "Alpha" },
        { fileNum: 2, text: "Beta" },
        { fileNum: 3, text: "Gamma" },
      ],
    });
    const result = await PptxExtractor.extract(buffer);
    const texts = result.slides.map((s) => slideText(s));
    expect(texts).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("reorders slides to match sldIdLst when PowerPoint reordered them", async () => {
    // Files: slide1=Alpha, slide2=Beta, slide3=Gamma
    // Presentation order: slide3, slide1, slide2 (author reordered in UI)
    const buffer = await buildPptx({
      slides: [
        { fileNum: 1, text: "Alpha" },
        { fileNum: 2, text: "Beta" },
        { fileNum: 3, text: "Gamma" },
      ],
      sldIdLst: [
        { id: 260, rId: "rId3", fileNum: 3 }, // Gamma first
        { id: 324, rId: "rId4", fileNum: 1 }, // Alpha second
        { id: 388, rId: "rId5", fileNum: 2 }, // Beta third
      ],
    });
    const result = await PptxExtractor.extract(buffer);
    const texts = result.slides.map((s) => slideText(s));
    expect(texts).toEqual(["Gamma", "Alpha", "Beta"]);
  });

  it("handles file-number gaps (slide1, slide2, slide4) in presentation order", async () => {
    // Simulates a deletion: slide3 was removed, leaving slide1, slide2, slide4
    // Presentation order: slide1, slide2, slide4 (natural order, but with a gap)
    const buffer = await buildPptx({
      slides: [
        { fileNum: 1, text: "Alpha" },
        { fileNum: 2, text: "Beta" },
        { fileNum: 4, text: "Delta" },
      ],
      sldIdLst: [
        { id: 260, rId: "rId3", fileNum: 1 },
        { id: 324, rId: "rId4", fileNum: 2 },
        { id: 388, rId: "rId5", fileNum: 4 },
      ],
    });
    const result = await PptxExtractor.extract(buffer);
    const texts = result.slides.map((s) => slideText(s));
    expect(texts).toEqual(["Alpha", "Beta", "Delta"]);
  });

  it("handles file-number gaps with reordering", async () => {
    // Files: slide1=Alpha, slide2=Beta, slide4=Delta (slide3 deleted)
    // Presentation order: slide4, slide2, slide1 (author reordered after deletion)
    const buffer = await buildPptx({
      slides: [
        { fileNum: 1, text: "Alpha" },
        { fileNum: 2, text: "Beta" },
        { fileNum: 4, text: "Delta" },
      ],
      sldIdLst: [
        { id: 260, rId: "rId3", fileNum: 4 }, // Delta first
        { id: 324, rId: "rId4", fileNum: 2 }, // Beta second
        { id: 388, rId: "rId5", fileNum: 1 }, // Alpha third
      ],
    });
    const result = await PptxExtractor.extract(buffer);
    const texts = result.slides.map((s) => slideText(s));
    expect(texts).toEqual(["Delta", "Beta", "Alpha"]);
  });

  it("falls back to filename order when sldIdLst is empty", async () => {
    // presentation.xml exists but has no <p:sldId> entries
    const zip = new JSZip();
    const FIXED_DATE = new Date(0);
    const add = (path, content) => zip.file(path, content, { date: FIXED_DATE });

    const slides = [
      { fileNum: 1, text: "Alpha" },
      { fileNum: 2, text: "Beta" },
    ];
    add("[Content_Types].xml", contentTypes([1, 2]));
    add("_rels/.rels", rootRels());
    // presentation.xml with empty sldIdLst
    add(
      "ppt/presentation.xml",
      XML_HEADER +
        `<p:presentation ${XMLNS}><p:sldMasterIdLst><p:sldMasterId id="2147483660" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    );
    add(
      "ppt/_rels/presentation.xml.rels",
      presentationRels([
        { rId: "rId3", fileNum: 1 },
        { rId: "rId4", fileNum: 2 },
      ]),
    );
    add("ppt/theme/theme1.xml", themeXml());
    add("ppt/slideMasters/slideMaster1.xml", masterXml());
    add("ppt/slideMasters/_rels/slideMaster1.xml.rels", masterRels());
    add("ppt/slideLayouts/slideLayout1.xml", layoutXml());
    add("ppt/slideLayouts/_rels/slideLayout1.xml.rels", layoutRels());
    for (const s of slides) {
      add(`ppt/slides/slide${s.fileNum}.xml`, slideXml(s.text));
      add(`ppt/slides/_rels/slide${s.fileNum}.xml.rels`, slideRels());
    }
    for (const entry of Object.values(zip.files)) entry.date = FIXED_DATE;
    const buffer = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });

    const result = await PptxExtractor.extract(buffer);
    const texts = result.slides.map((s) => slideText(s));
    // Falls back to filename-sorted order
    expect(texts).toEqual(["Alpha", "Beta"]);
  });
});
