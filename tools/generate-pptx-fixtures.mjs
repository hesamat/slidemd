/**
 * PPTX fixture generator for the pptx-import integration tests.
 *
 * Builds minimal-but-realistic .pptx files whose slide XML is transcribed from
 * real PowerPoint files (slide geometry, placeholder types, bullet properties,
 * split runs, autofit, extLst chains, slide-number fields, footers). All
 * lecture text has been replaced with neutral wording and images with tiny
 * generated gradient PNGs, so the fixtures are small (< 50 KB) and free of
 * copyrighted material while exercising the same extraction paths the
 * converter hits with real imports.
 *
 * Regenerate with:  node tools/generate-pptx-fixtures.mjs
 */
import JSZip from "jszip";
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = fileURLToPath(new URL("../src/__tests__/fixtures/pptx/", import.meta.url));

// ---------------------------------------------------------------------------
// Tiny PNG generator (solid vertical gradient, ~130 bytes)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function makePng(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const shade = Math.round((y / Math.max(1, height - 1)) * 200) + 30;
      const offset = y * (1 + width * 3) + 1 + x * 3;
      raw[offset] = shade;
      raw[offset + 1] = Math.round(shade * 0.75);
      raw[offset + 2] = Math.min(255, shade + 40);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Shared deck scaffolding (structure modeled on real PowerPoint output)
// ---------------------------------------------------------------------------

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const PN = "http://schemas.openxmlformats.org/presentationml/2006/main";
const AN = "http://schemas.openxmlformats.org/drawingml/2006/main";
const RN = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT = "http://schemas.openxmlformats.org/package/2006/content-types";

const XMLNS = `xmlns:a="${AN}" xmlns:r="${RN}" xmlns:p="${PN}"`;

function contentTypes(slideCount) {
  const slides = Array.from(
    { length: slideCount },
    (_, i) =>
      `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
  ).join("");
  return XML_HEADER +
    `<Types xmlns="${CT}">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="png" ContentType="image/png"/>` +
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
    slides +
    `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
    `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
    `</Types>`;
}

// defaultTextStyle transcribed from a real PowerPoint presentation.xml
const DEFAULT_TEXT_STYLE = `
<p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr>
<a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>
<a:lvl2pPr marL="457200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl2pPr>
<a:lvl3pPr marL="914400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl3pPr>
<a:lvl4pPr marL="1371600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl4pPr>
<a:lvl5pPr marL="1828800" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl5pPr>
</p:defaultTextStyle>`;

function presentationXml(slideCount) {
  const ids = Array.from(
    { length: slideCount },
    (_, i) => `<p:sldId id="${260 + i * 64}" r:id="rId${3 + i}"/>`,
  ).join("");
  return XML_HEADER +
    `<p:presentation ${XMLNS} showSpecialPlsOnTitleSld="0" saveSubsetFonts="1" autoCompressPictures="0">` +
    `<p:sldMasterIdLst><p:sldMasterId id="2147483660" r:id="rId1"/></p:sldMasterIdLst>` +
    `<p:sldIdLst>${ids}</p:sldIdLst>` +
    `<p:sldSz cx="9144000" cy="5143500"/>` +
    `<p:notesSz cx="6858000" cy="9144000"/>` +
    DEFAULT_TEXT_STYLE +
    `</p:presentation>`;
}

function presentationRels(slideCount) {
  const slides = Array.from(
    { length: slideCount },
    (_, i) =>
      `<Relationship Id="rId${3 + i}" Type="${RN}/slide" Target="slides/slide${i + 1}.xml"/>`,
  ).join("");
  return XML_HEADER +
    `<Relationships xmlns="${RELS}">` +
    `<Relationship Id="rId1" Type="${RN}/officeDocument" Target="ppt/presentation.xml"/>` +
    `<Relationship Id="rId2" Type="${RN}/theme" Target="theme/theme1.xml"/>` +
    slides +
    `</Relationships>`;
}

// txStyles transcribed from a real PowerPoint slideMaster (Office defaults)
const MASTER_TX_STYLES = `
<p:txStyles><p:titleStyle><a:lvl1pPr algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="4400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr></p:titleStyle>
<p:bodyStyle><a:lvl1pPr marL="228600" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="1000"/></a:spcBef><a:buFont typeface="Arial" panose="020B0604020202020204" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="2800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>
<a:lvl2pPr marL="685800" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="500"/></a:spcBef><a:buFont typeface="Arial" panose="020B0604020202020204" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="2400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl2pPr>
<a:lvl3pPr marL="1143000" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="500"/></a:spcBef><a:buFont typeface="Arial" panose="020B0604020202020204" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl3pPr></p:bodyStyle>
<p:otherStyle><a:lvl1pPr marL="228600" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:buFont typeface="Arial" panose="020B0604020202020204" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:otherStyle>
</p:txStyles>`;

function masterXml() {
  const spTree =
    `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>`;
  return XML_HEADER +
    `<p:sldMaster ${XMLNS}>${spTree}` +
    `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    MASTER_TX_STYLES +
    `<p:sldLayoutIdLst><p:sldLayoutId id="2147483661" r:id="rId1"/></p:sldLayoutIdLst>` +
    `</p:sldMaster>`;
}

function masterRels() {
  return XML_HEADER +
    `<Relationships xmlns="${RELS}">` +
    `<Relationship Id="rId1" Type="${RN}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
    `<Relationship Id="rId2" Type="${RN}/theme" Target="../theme/theme1.xml"/>` +
    `</Relationships>`;
}

function layoutXml() {
  const spTree =
    `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>`;
  return XML_HEADER +
    `<p:sldLayout ${XMLNS} type="blank">${spTree}` +
    `<p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>` +
    `</p:sldLayout>`;
}

function layoutRels() {
  return XML_HEADER +
    `<Relationships xmlns="${RELS}">` +
    `<Relationship Id="rId1" Type="${RN}/slideMaster" Target="../slideMasters/slideMaster1.xml"/>` +
    `</Relationships>`;
}

// clrScheme + fontScheme transcribed from a real PowerPoint theme
function themeXml() {
  const clrScheme =
    `<a:clrScheme name="Blue"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>` +
    `<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="17406D"/></a:dk2>` +
    `<a:lt2><a:srgbClr val="DBEFF9"/></a:lt2><a:accent1><a:srgbClr val="0F6FC6"/></a:accent1>` +
    `<a:accent2><a:srgbClr val="009DD9"/></a:accent2><a:accent3><a:srgbClr val="0BD0D9"/></a:accent3>` +
    `<a:accent4><a:srgbClr val="10CF9B"/></a:accent4><a:accent5><a:srgbClr val="7CCA62"/></a:accent5>` +
    `<a:accent6><a:srgbClr val="A5C249"/></a:accent6><a:hlink><a:srgbClr val="F49100"/></a:hlink>` +
    `<a:folHlink><a:srgbClr val="85DFD0"/></a:folHlink></a:clrScheme>`;
  const fontScheme =
    `<a:fontScheme name="Tw Cen MT"><a:majorFont><a:latin typeface="Tw Cen MT" panose="020B0602020104020603"/>` +
    `<a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
    `<a:minorFont><a:latin typeface="Tw Cen MT" panose="020B0602020104020603"/>` +
    `<a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>`;
  return XML_HEADER +
    `<a:theme xmlns:a="${AN}" name="Office Theme"><a:themeElements>` +
    clrScheme + fontScheme +
    `</a:themeElements></a:theme>`;
}

function slideRels(imageCount = 0) {
  const images = Array.from(
    { length: imageCount },
    (_, i) =>
      `<Relationship Id="rId${2 + i}" Type="${RN}/image" Target="../media/image${i + 1}.png"/>`,
  ).join("");
  return XML_HEADER +
    `<Relationships xmlns="${RELS}">` +
    `<Relationship Id="rId1" Type="${RN}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
    images +
    `</Relationships>`;
}

function slideXml(body, bg = "") {
  return XML_HEADER +
    `<p:sld ${XMLNS}><p:cSld>${bg}<p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
    body +
    `</p:spTree></p:cSld></p:sld>`;
}

// ---------------------------------------------------------------------------
// Shared slide fragments (transcribed from real PowerPoint slides)
// ---------------------------------------------------------------------------

const EMU = (pt) => Math.round(pt * 12700);

/** Full-width title box (transcribed from Week 03 slide13 / test.pptx slide7). */
function titleBox({ id, name, sz, x, y, w, h, text, algn = "ctr", creationId }) {
  const bodyPr = algn === "ctr" ? "<a:bodyPr><a:normAutofit/></a:bodyPr>" : "<a:bodyPr/><a:lstStyle/>";
  const alignAttr = algn === "l" ? ' algn="l"' : "";
  const run =
    sz >= 4000
      ? `<a:rPr lang="en-US" sz="${sz}" dirty="0"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></a:rPr>`
      : `<a:rPr b="0" lang="en-US" sz="${sz}" spc="-1" strike="noStrike"><a:solidFill><a:schemeClr val="dk1"/></a:solidFill><a:latin typeface="Tw Cen MT"/></a:rPr>`;
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"><a:extLst><a:ext uri="{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}"><a16:creationId xmlns:a16="http://schemas.microsoft.com/office/drawing/2014/main" id="${creationId}"/></a:ext></a:extLst></p:cNvPr><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${EMU(x)}" y="${EMU(y)}"/><a:ext cx="${EMU(w)}" cy="${EMU(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="0"><a:noFill/></a:ln></p:spPr><p:txBody>${bodyPr}<a:p><a:pPr${alignAttr} indent="0" defTabSz="914400"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:buNone/></a:pPr><a:r>${run}<a:t>${text}</a:t></a:r><a:endParaRPr b="0" lang="en-US" sz="${sz}" spc="-1" strike="noStrike"/></a:p></p:txBody></p:sp>`;
}

/** Picture element (transcribed from Week 03 slide13/slide67). */
function pic({ id, name, x, y, w, h, embed, descr = "", flipH = false, creationId, minimal = false }) {
  if (minimal) {
    // test.pptx-style minimal pic chain
    return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${name}" descr=""></p:cNvPr><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${embed}"></a:blip><a:stretch/></p:blipFill><p:spPr><a:xfrm><a:off x="${EMU(x)}" y="${EMU(y)}"/><a:ext cx="${EMU(w)}" cy="${EMU(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="0"><a:noFill/></a:ln></p:spPr></p:pic>`;
  }
  const flip = flipH ? ' flipH="1"' : "";
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${name}" descr="${descr}"><a:extLst><a:ext uri="{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}"><a16:creationId xmlns:a16="http://schemas.microsoft.com/office/drawing/2014/main" id="${creationId}"/></a:ext></a:extLst></p:cNvPr><p:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill rotWithShape="1"><a:blip r:embed="${embed}" cstate="screen"><a:alphaModFix/><a:extLst><a:ext uri="{28A0092B-C50C-407E-A947-70E740481C1C}"><a14:useLocalDpi xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main"/></a:ext></a:extLst></a:blip><a:stretch/></p:blipFill><p:spPr bwMode="auto"><a:xfrm${flip}><a:off x="${EMU(x)}" y="${EMU(y)}"/><a:ext cx="${EMU(w)}" cy="${EMU(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:extLst><a:ext uri="{909E8E84-426E-40DD-AFC4-6F175D3DCCD1}"><a14:hiddenFill xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a14:hiddenFill></a:ext></a:extLst></p:spPr></p:pic>`;
}

/** Slide number placeholder (transcribed from Week 03 slide13). */
function slideNumberBox(id, number, creationId) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Slide Number Placeholder ${id - 1}"><a:extLst><a:ext uri="{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}"><a16:creationId xmlns:a16="http://schemas.microsoft.com/office/drawing/2014/main" id="${creationId}"/></a:ext></a:extLst></p:cNvPr><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="12"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr marL="0" marR="0" lvl="0" indent="0" algn="r" defTabSz="457200" rtl="0" eaLnBrk="1" fontAlgn="auto" latinLnBrk="0" hangingPunct="1"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft><a:buClrTx/><a:buSzTx/><a:buFontTx/><a:buNone/><a:tabLst/><a:defRPr/></a:pPr><a:fld id="{4582CE23-FBF7-DC48-86EE-D59CCB036E08}" type="slidenum"><a:rPr kumimoji="0" lang="en-US" sz="1200" b="0" i="0" u="none" strike="noStrike" kern="1200" cap="none" spc="0" normalizeH="0" baseline="0" noProof="0" smtClean="0"><a:ln><a:noFill/></a:ln><a:solidFill><a:prstClr val="white"/></a:solidFill><a:effectLst/><a:uLnTx/><a:uFillTx/><a:latin typeface="Tw Cen MT" panose="020B0602020104020603"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:rPr><a:pPr marL="0" marR="0" lvl="0" indent="0" algn="r" defTabSz="457200" rtl="0" eaLnBrk="1" fontAlgn="auto" latinLnBrk="0" hangingPunct="1"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft><a:buClrTx/><a:buSzTx/><a:buFontTx/><a:buNone/><a:tabLst/><a:defRPr/></a:pPr><a:t>${number}</a:t></a:fld><a:endParaRPr kumimoji="0" lang="en-US" sz="1200" b="0" i="0" u="none" strike="noStrike" kern="1200" cap="none" spc="0" normalizeH="0" baseline="0" noProof="0"><a:ln><a:noFill/></a:ln><a:solidFill><a:prstClr val="white"/></a:solidFill><a:effectLst/><a:uLnTx/><a:uFillTx/><a:latin typeface="Tw Cen MT" panose="020B0602020104020603"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:endParaRPr></a:p></p:txBody></p:sp>`;
}

/** Footer placeholder (transcribed from Week 03 slide13). */
function footerBox(id, text, creationId) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Footer Placeholder ${id - 1}"><a:extLst><a:ext uri="{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}"><a16:creationId xmlns:a16="http://schemas.microsoft.com/office/drawing/2014/main" id="${creationId}"/></a:ext></a:extLst></p:cNvPr><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="ftr" sz="quarter" idx="11"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr marL="0" marR="0" lvl="0" indent="0" algn="ctr" defTabSz="457200" rtl="0" eaLnBrk="1" fontAlgn="auto" latinLnBrk="0" hangingPunct="1"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft><a:buClrTx/><a:buSzTx/><a:buFontTx/><a:buNone/><a:tabLst/><a:defRPr/></a:pPr><a:r><a:rPr kumimoji="0" lang="en-US" sz="1200" b="0" i="0" u="none" strike="noStrike" kern="1200" cap="none" spc="0" normalizeH="0" baseline="0" noProof="0"><a:ln><a:noFill/></a:ln><a:solidFill><a:prstClr val="white"/></a:solidFill><a:effectLst/><a:uLnTx/><a:uFillTx/><a:latin typeface="Tw Cen MT" panose="020B0602020104020603"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:rPr><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
}

// ---------------------------------------------------------------------------
// Fixture slide bodies
// ---------------------------------------------------------------------------

/**
 * one-image-plus-body.pptx — one dominant image (left, full height) + body
 * text (right). Structure transcribed from Week 03 slide13; body box moved to
 * the right half so the text is unambiguously in the right column. The current
 * converter emits `two-column` with the image in @main and the TEXT in @media.
 */
function oneImagePlusBodySlide() {
  const title = titleBox({
    id: 2,
    name: "Title 1",
    sz: 8000,
    x: 0,
    y: 1,
    w: 960,
    h: 133,
    text: "Strings and Immutability",
    creationId: "{469C1986-A4A3-5A45-852E-EFFA9B41ADC3}",
  });

  const image = pic({
    id: 6,
    name: "Picture 6",
    descr: "illustration",
    x: 0,
    y: 112,
    w: 521,
    h: 347,
    embed: "rId2",
    creationId: "{D82144EC-8C07-883D-1366-E14D036528BD}",
  });

  // Content placeholder transcribed from slide13, geometry shifted right.
  const body =
    `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content Placeholder 2"><a:extLst><a:ext uri="{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}"><a16:creationId xmlns:a16="http://schemas.microsoft.com/office/drawing/2014/main" id="{67503881-0741-A846-9923-2816961980AC}"/></a:ext></a:extLst></p:cNvPr><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${EMU(540)}" y="${EMU(108)}"/><a:ext cx="${EMU(390)}" cy="${EMU(402)}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr anchor="ctr"><a:normAutofit lnSpcReduction="10000"/></a:bodyPr><a:lstStyle/>` +
    `<a:p><a:r><a:rPr lang="en-US" dirty="0"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></a:rPr><a:t>Strings cannot be changed in place</a:t></a:r></a:p>` +
    `<a:p><a:r><a:rPr lang="en-US" sz="4000" u="sng" dirty="0"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></a:rPr><a:t>Every operation returns a new string</a:t></a:r></a:p>` +
    `<a:p><a:r><a:rPr lang="en-US" sz="4000" u="sng" dirty="0"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></a:rPr><a:t>Rebinding a variable is not mutation</a:t></a:r></a:p>` +
    `<a:p><a:r><a:rPr lang="en-US" dirty="0"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></a:rPr><a:t>We capture the new value with an assignment:</a:t></a:r></a:p>` +
    `<a:p><a:pPr marL="1068388" indent="0"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US" sz="2400" dirty="0"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:latin typeface="Courier" pitchFamily="2" charset="0"/></a:rPr><a:t>greeting = 'hello world'</a:t></a:r></a:p>` +
    `<a:p><a:pPr marL="1068388" indent="0"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US" sz="2400" dirty="0" err="1"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:latin typeface="Courier" pitchFamily="2" charset="0"/></a:rPr><a:t>new_greeting</a:t></a:r><a:r><a:rPr lang="en-US" sz="2400" dirty="0"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:latin typeface="Courier" pitchFamily="2" charset="0"/></a:rPr><a:t> = </a:t></a:r><a:r><a:rPr lang="en-US" sz="2400" dirty="0" err="1"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:latin typeface="Courier" pitchFamily="2" charset="0"/></a:rPr><a:t>greeting.upper</a:t></a:r><a:r><a:rPr lang="en-US" sz="2400" dirty="0"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:latin typeface="Courier" pitchFamily="2" charset="0"/></a:rPr><a:t>( )</a:t></a:r></a:p>` +
    `<a:p><a:pPr marL="1068388" indent="0"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US" sz="2400" dirty="0"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:latin typeface="Courier" pitchFamily="2" charset="0"/></a:rPr><a:t>print(greeting)      # unchanged</a:t></a:r></a:p>` +
    `</p:txBody></p:sp>`;

  const footer = footerBox(4, "Course Materials 2026", "{614F45E3-7A07-0A4D-AB71-68484ACEEF57}");
  const slidenum = slideNumberBox(5, "1", "{026FC984-A5C1-7B4A-AB5B-9250E9454902}");

  // Background fill transcribed from slide13.
  const bg = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="F7D99F"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
  return {
    bg,
    body: image + title + body + slidenum + footer,
  };
}

/**
 * two-text-columns.pptx — two text columns (auto-numbered lists), no images.
 * Structure transcribed from Week 03 slide2 body placeholder; the left box
 * crosses the slide midpoint like real two-column decks.
 */
function twoTextColumnsSlide() {
  const title = titleBox({
    id: 2,
    name: "Title 1",
    sz: 4400,
    x: 60,
    y: 20,
    w: 640,
    h: 60,
    text: "Feature Comparison",
    algn: "l",
    creationId: "{469C1986-A4A3-5A45-852E-EFFA9B41ADC3}",
  });

  const bulletBody = ({ id, name, idx, x, y, w, h, items, creationId }) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"><a:extLst><a:ext uri="{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}"><a16:creationId xmlns:a16="http://schemas.microsoft.com/office/drawing/2014/main" id="${creationId}"/></a:ext></a:extLst></p:cNvPr><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="half" idx="${idx}"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${EMU(x)}" y="${EMU(y)}"/><a:ext cx="${EMU(w)}" cy="${EMU(h)}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr numCol="1" anchor="ctr"><a:normAutofit fontScale="85000" lnSpcReduction="10000"/></a:bodyPr><a:lstStyle/>${items}</p:txBody></p:sp>`;

  const autoNumItem = (runs) =>
    `<a:p><a:pPr marL="342900" indent="-342900"><a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"/></a:pPr>${runs}</a:p>`;
  const run = (text, { err = false, sz = 2400 } = {}) =>
    `<a:r><a:rPr lang="en-US" sz="${sz}" dirty="0"${err ? ' err="1"' : ""}/><a:t>${text}</a:t></a:r>`;

  const leftItems =
    autoNumItem(run("Install the package")) +
    autoNumItem(run("Configure the runtime")) +
    autoNumItem(run("Initialize the project")) +
    autoNumItem(run("Write the first module")) +
    autoNumItem(run("Run the ") + run("test", { err: true }) + run(" suite"));

  const rightItems =
    autoNumItem(run("Version control basics")) +
    autoNumItem(run("Branching and merging")) +
    autoNumItem(run("Code review workflow")) +
    autoNumItem(run("Continuous integration"));

  const left = bulletBody({
    id: 3,
    name: "Text Placeholder 2",
    idx: 1,
    x: 60,
    y: 97,
    w: 340,
    h: 270,
    items: leftItems,
    creationId: "{FD9F1D67-25E0-F54A-8B84-7450D5AF51FE}",
  });
  const right = bulletBody({
    id: 4,
    name: "Text Placeholder 3",
    idx: 2,
    x: 420,
    y: 112,
    w: 290,
    h: 270,
    items: rightItems,
    creationId: "{1C2B3A59-4E9A-41A8-8C36-97F53E2C14A7}",
  });

  return title + left + right;
}

/**
 * decorative-icon.pptx — small icon beside the heading (transcribed from Week
 * 03 slide67 pic structure, repositioned/resized), body text below. The icon
 * is small (40x40 pt), sits just below the 10% top margin and is currently
 * treated as content instead of decoration.
 */
function decorativeIconSlide() {
  const title = titleBox({
    id: 2,
    name: "Title 1",
    sz: 4400,
    x: 60,
    y: 20,
    w: 500,
    h: 50,
    text: "Getting Started",
    algn: "l",
    creationId: "{469C1986-A4A3-5A45-852E-EFFA9B41ADC3}",
  });

  const icon = pic({
    id: 10,
    name: "Picture 9",
    x: 580,
    y: 50,
    w: 40,
    h: 40,
    embed: "rId2",
    flipH: true,
    creationId: "{A8580954-7034-2141-77FC-9AF7302EBC19}",
  });

  const body =
    `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content Placeholder 2"><a:extLst><a:ext uri="{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}"><a16:creationId xmlns:a16="http://schemas.microsoft.com/office/drawing/2014/main" id="{67503881-0741-A846-9923-2816961980AC}"/></a:ext></a:extLst></p:cNvPr><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${EMU(60)}" y="${EMU(90)}"/><a:ext cx="${EMU(600)}" cy="${EMU(270)}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr anchor="ctr"><a:normAutofit lnSpcReduction="10000"/></a:bodyPr><a:lstStyle/>` +
    `<a:p><a:r><a:rPr lang="en-US" dirty="0"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></a:rPr><a:t>Download the latest release</a:t></a:r></a:p>` +
    `<a:p><a:r><a:rPr lang="en-US" dirty="0"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></a:rPr><a:t>Install the command line tool</a:t></a:r></a:p>` +
    `<a:p><a:r><a:rPr lang="en-US" dirty="0"><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></a:rPr><a:t>Verify the install with a version check</a:t></a:r></a:p>` +
    `</p:txBody></p:sp>`;

  return title + body + icon;
}

/**
 * verbose-bullets.pptx — real bullet machinery (buChar + hanging indent),
 * literal bullet glyphs, trailing spaces, tabs, an empty glyph-only text box,
 * a footer and a slide number. Structure transcribed from test.pptx slide7.
 */
function verboseBulletsSlide() {
  const title = titleBox({
    id: 521,
    name: "PlaceHolder 1",
    sz: 8000,
    x: 0,
    y: 0,
    w: 960,
    h: 133,
    text: "How Variables Work",
    creationId: "{C1E5F2A6-8B4D-4E7C-9A1F-3D6B8C0A5E29}",
  });

  const picture = pic({
    id: 520,
    name: "Picture 2",
    x: 521,
    y: 106,
    w: 439,
    h: 400,
    embed: "rId2",
    minimal: true,
  });

  // buChar bullet paragraph machinery from test.pptx slide7.
  const buCharP = ({ marL = 228600, indent = -228600, runs, buChar = "•" }) =>
    `<a:p><a:pPr marL="${marL}" indent="${indent}" defTabSz="914400"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="1001"/></a:spcBef><a:buClr><a:srgbClr val="000000"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="${buChar}"/></a:pPr>${runs}<a:endParaRPr b="0" lang="en-US" sz="2800" spc="-1" strike="noStrike"/></a:p>`;
  const buNoneP = ({ marL = 342900, indent = -342900, runs } = {}) =>
    `<a:p><a:pPr marL="${marL}" indent="${indent}" defTabSz="914400"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="1001"/></a:spcBef><a:buNone/></a:pPr>${runs}<a:endParaRPr b="0" lang="en-US" sz="2800" spc="-1" strike="noStrike"/></a:p>`;
  const run = (text, { sz = 2800, i = false, u = false, err = false } = {}) =>
    `<a:r><a:rPr b="0"${i ? ' i="1"' : ""} lang="en-US" sz="${sz}" spc="-1" strike="noStrike"${u ? ' u="sng"' : ""}${err ? ' err="1"' : ""}><a:solidFill><a:schemeClr val="dk1"/></a:solidFill>${u ? "<a:uFillTx/>" : ""}<a:latin typeface="Tw Cen MT"/></a:rPr><a:t>${text}</a:t></a:r>`;
  const br = (sz = 2800) => `<a:br><a:rPr sz="${sz}"/></a:br>`;

  const body =
    `<p:sp><p:nvSpPr><p:cNvPr id="522" name="PlaceHolder 2"></p:cNvPr><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${EMU(19)}" y="${EMU(97)}"/><a:ext cx="${EMU(643)}" cy="${EMU(422)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="0"><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr lIns="91440" rIns="91440" tIns="45720" bIns="45720" anchor="ctr"><a:normAutofit fontScale="90336"/></a:bodyPr>` +
    // 1. clean buChar bullet with split runs (bold-italic lead + regular body)
    buCharP({ runs: run("Store references", { sz: 4000, i: true, u: true }) + run(": a variable holds an address in memory") }) +
    // 2. buChar bullet whose run has trailing spaces (=> nbsp runs)
    buCharP({ runs: run("Pointers track objects    ") + run(": the address points to a live object") }) +
    // 3. buChar bullet with <a:br> line breaks inside the run
    buCharP({
      runs:
        run("(A name can refer to many ") +
        run("kinds", { u: true }) +
        br() +
        run("of objects over time") +
        br() +
        run("but only one at a time)"),
    }) +
    // 4. buNone paragraph with hanging indent (CSS text-indent bullet path)
    buNoneP({ runs: run("Sub-point without an explicit marker", { sz: 2400, err: true }) }) +
    // 5. literal bullet glyph typed as text in a plain paragraph (no hanging
    //    indent, so no CSS-bullet detection — the glyph leaks through)
    `<a:p><a:pPr marL="0" indent="0" defTabSz="914400"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="1001"/></a:spcBef><a:buNone/></a:pPr><a:r><a:rPr b="0" lang="en-US" sz="2800" spc="-1" strike="noStrike"><a:solidFill><a:schemeClr val="dk1"/></a:solidFill><a:latin typeface="Tw Cen MT"/></a:rPr><a:t>• Verify the installation</a:t></a:r><a:endParaRPr b="0" lang="en-US" sz="2800" spc="-1" strike="noStrike"/></a:p>` +
    // 6. tab inside a run (pptxtojson expands tabs to four nbsp)
    buNoneP({ runs: run("Level\tItem") }) +
    // 7. empty paragraph (endParaRPr only)
    `<a:p><a:endParaRPr b="0" lang="en-US" sz="2800" spc="-1" strike="noStrike"/></a:p>` +
    `</p:txBody></p:sp>`;

  // Empty text box that contains only a bullet glyph.
  const emptyGlyphBox =
    `<p:sp><p:nvSpPr><p:cNvPr id="525" name="TextBox 8"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${EMU(60)}" y="${EMU(380)}"/><a:ext cx="${EMU(200)}" cy="${EMU(60)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>` +
    `<a:p><a:pPr marL="228600" indent="-228600"><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="en-US" sz="1800" dirty="0"/><a:t>•</a:t></a:r></a:p>` +
    `</p:txBody></p:sp>`;

  const footer = footerBox(523, "Course Materials 2026", "{2E7B9C51-6A3D-4F18-9B62-C0D8A1F4E3B7}");
  const slidenum = slideNumberBox(5, "1", "{8F1A6C34-9B2E-4D5C-A7D3-E5B6C8D9A1F4}");

  return title + body + picture + emptyGlyphBox + footer + slidenum;
}

// ---------------------------------------------------------------------------
// Build & write fixtures
// ---------------------------------------------------------------------------

const FIXTURES = [
  {
    name: "one-image-plus-body.pptx",
    slideBody: oneImagePlusBodySlide(),
    imageCount: 1,
  },
  {
    name: "two-text-columns.pptx",
    slideBody: twoTextColumnsSlide(),
    imageCount: 0,
  },
  {
    name: "decorative-icon.pptx",
    slideBody: decorativeIconSlide(),
    imageCount: 1,
  },
  {
    name: "verbose-bullets.pptx",
    slideBody: verboseBulletsSlide(),
    imageCount: 1,
  },
];

function buildFixture({ name, slideBody, imageCount }) {
  const zip = new JSZip();
  const FIXED_DATE = new Date(0);
  // Pin the ZIP entry timestamps so regeneration is byte-identical.
  const add = (path, content) => zip.file(path, content, { date: FIXED_DATE });
  add("[Content_Types].xml", contentTypes(1));
  add("_rels/.rels", "");
  add("ppt/presentation.xml", presentationXml(1));
  add("ppt/_rels/presentation.xml.rels", presentationRels(1));
  add("ppt/theme/theme1.xml", themeXml());
  add("ppt/slideMasters/slideMaster1.xml", masterXml());
  add("ppt/slideMasters/_rels/slideMaster1.xml.rels", masterRels());
  add("ppt/slideLayouts/slideLayout1.xml", layoutXml());
  add("ppt/slideLayouts/_rels/slideLayout1.xml.rels", layoutRels());
  const slide = typeof slideBody === "string" ? { body: slideBody } : slideBody;
  const { bg = "", body } = slide;
  add("ppt/slides/slide1.xml", slideXml(body, bg));
  add("ppt/slides/_rels/slide1.xml.rels", slideRels(imageCount));
  for (let i = 0; i < imageCount; i++) {
    add(`ppt/media/image${i + 1}.png`, makePng(64, 48));
  }
  return zip;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const fixture of FIXTURES) {
    const zip = buildFixture(fixture);
    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    writeFileSync(join(OUT_DIR, fixture.name), buffer);
    console.log(`wrote ${fixture.name} (${(buffer.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
