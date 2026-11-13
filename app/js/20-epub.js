/* ═══════════════════════════════════════════════════════════════
   v4.46 T-035 EPUB 整书翻译（两档位：快速 / 质量）
   EPUB = zip 包，内含 XHTML 章节 + 元数据。
   策略：解包后原地替换各 XHTML 正文，保留图片/CSS/字体/元数据，重新打包。
   ═══════════════════════════════════════════════════════════════ */

const EPUB_MT = 'application/epub+zip';
const JSZIP_CDN = [
  'https://registry.npmmirror.com/jszip/3.10.1/files/dist/jszip.min.js',
  'https://cdn.bootcdn.net/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js'
];

function epubSplitLines(s){
  return String(s || '').split(String.fromCharCode(10))
    .map(function(x){ return x.replace(String.fromCharCode(13), '').trim(); })
    .filter(function(x){ return x; });
}

function epubZipText(zip, path){
  var f = zip.file(path);
  return f ? f.async('text') : Promise.resolve('');
}

// 从 META-INF/container.xml 找 opf 路径
async function epubFindOpf(zip){
  var container = await epubZipText(zip, 'META-INF/container.xml');
  var m = container.match(/full-path="([^"]+)"/);
  return m ? m[1] : 'OEBPS/content.opf';
}

// 解析 EPUB：返回与 docx 对齐的 chapters 结构 + 内存里的 epub 原始数据
async function parseEpub(file, onProgress){
  if(onProgress) onProgress('读取 EPUB…', 0.12);
  var JSZip = await loadLib('JSZip', JSZIP_CDN);
  var buf = await file.arrayBuffer();
  var zip = await JSZip.loadAsync(buf);
  var opfPath = await epubFindOpf(zip);
  var base = opfPath.indexOf('/') >= 0 ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  var opf = await epubZipText(zip, opfPath);
  var opfDoc = new DOMParser().parseFromString(opf, 'application/xml');
  var manifest = {};
  opfDoc.querySelectorAll('manifest > item').forEach(function(it){ manifest[it.getAttribute('id')] = it.getAttribute('href'); });
  var spine = [];
  opfDoc.querySelectorAll('spine > itemref').forEach(function(it){
    var id = it.getAttribute('idref');
    if(manifest[id]) spine.push(base + manifest[id]);
  });
  var titles = opfDoc.getElementsByTagName('title');
  if(!titles.length) titles = opfDoc.getElementsByTagName('dc:title');
  var bookTitle = titles.length ? titles[0].textContent.trim() : file.name.slice(0, file.name.length - 5);
  if(onProgress) onProgress('分析章节…', 0.5);
  var chapters = [];
  var total = spine.length || 1;
  for(var i = 0; i < spine.length; i++){
    var href = spine[i];
    var html = await epubZipText(zip, href);
    var doc = new DOMParser().parseFromString(html, 'application/xhtml+xml');
    var blocks = [];
    doc.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre').forEach(function(el){
      var t = (el.textContent || '').trim();
      if(t) blocks.push(t);
    });
    var h1 = doc.querySelector('h1');
    var chapTitle = h1 ? h1.textContent.trim() : (i === 0 ? bookTitle : ('第' + (i + 1) + '章'));
    chapters.push({ title: chapTitle, text: blocks.join(String.fromCharCode(10)), xhtml: href, _xhtml: html });
    if(onProgress) onProgress('第 ' + (i + 1) + '/' + total + ' 章', 0.5 + 0.45 * (i / total));
  }
  if(!chapters.length) chapters.push({ title: bookTitle, text: '', xhtml: null, _xhtml: '' });
  if(onProgress) onProgress('完成', 1);
  return {
    kind: 'epub',
    fileName: file.name,
    chapters: chapters,
    fullText: chapters.map(function(c){ return c.text; }).join(String.fromCharCode(10) + String.fromCharCode(10)),
    hasImages: true,
    _epub: { zip: zip, opfPath: opfPath, base: base, spine: spine, manifest: manifest, bookTitle: bookTitle }
  };
}

// 把译文写回各 XHTML，重新打包成 .epub（保留图片/CSS/字体等所有其他文件）
async function buildEpubFromChapters(epubData, chapters){
  var JSZip = await loadLib('JSZip', JSZIP_CDN);
  var zip = epubData.zip;
  var byPath = {};
  chapters.forEach(function(c){ if(c.xhtml) byPath[c.xhtml] = c; });
  for(var i = 0; i < epubData.spine.length; i++){
    var href = epubData.spine[i];
    var c = byPath[href];
    if(!c) continue;
    var raw = c._xhtml || await epubZipText(zip, href);
    var doc = new DOMParser().parseFromString(raw, 'application/xhtml+xml');
    var blocks = [];
    doc.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre').forEach(function(el){ blocks.push(el); });
    var paras = epubSplitLines(c.text);
    var n = Math.min(blocks.length, paras.length);
    for(var k = 0; k < n; k++){ blocks[k].textContent = paras[k]; }
    zip.file(href, new XMLSerializer().serializeToString(doc));
  }
  return await zip.generateAsync({ type: 'blob', mimeType: EPUB_MT });
}

window.parseEpub = parseEpub;
window.buildEpubFromChapters = buildEpubFromChapters;