"use client";

// Crop step for COG/GeoTIFF files inside the annotator.
//
// The annotator cannot — and should not — open a gigapixel raster: the browser does not
// decode TIFF and the bitmap would not fit in memory. Here the file is read by tiles, only
// so the user can pick where to work; what comes out is a size-limited PNG that enters the
// image list like any other. That way every existing tool, SAM included, works without
// knowing the crop came from a COG.
//
// OpenLayers is browser-only, so it comes in through import() inside the effect.

import { useCallback, useEffect, useRef, useState } from "react";
import type OlMapa from "ol/Map.js";
import type OlDesenho from "ol/interaction/Draw.js";
import { dimensionaRecorte, ehArquivoTiff, geraRecorte, leMetadados, medeFaixa } from "../lib/cog";
import type { MetadadosCog, PerfilCog, Recorte } from "../lib/cog";
import { fill } from "../lib/i18n";
import type { Copy, TranslationKey } from "../lib/i18n";

/** The profile is stored as a key so the label can follow the interface language. */
const ROTULO_PERFIL: Record<PerfilCog, TranslationKey> = {
  complete: "cogProfileComplete",
  "tiled-no-overviews": "cogProfileTiledNoOverviews",
  striped: "cogProfileStriped",
};

type Modo = "visivel" | "retangulo";

type Janela = { x: number; y: number; w: number; h: number };

export type CogRecorteProps = {
  origem: File | string;
  nome: string;
  copy: Copy;
  onCancelar: () => void;
  onPronto: (recorte: Recorte, nome: string) => void;
};

const LIMITE_MS = 45_000;

/** Port of the local conversion helper. SAM uses 7860; this is the one next door. */
const CONVERSOR_PADRAO = "http://127.0.0.1:7861";
const CHAVE_CONVERSOR = "poligome-cog-endpoint";
/** Key from before the rebranding; read once so an already saved endpoint is not lost. */
const CHAVE_CONVERSOR_LEGADA = "epiaka-cog-endpoint";

/** Rates measured on this codebase with `rio cogeo create`: deflate holds 20–25 MP/s and
 *  JPEG drops from 7 to 5 as the file grows. The estimate is deliberately pessimistic:
 *  overshooting annoys less than a bar that blows past its own deadline. */
function estimaMinutos(megapixels: number) {
  return Math.max(1, Math.ceil(megapixels / 5 / 60));
}

type Trabalho = {
  id: string;
  estado: "convertendo" | "pronto" | "erro";
  megapixels?: number;
  bytes_saida?: number;
  valido?: boolean;
  detalhe?: string;
  url?: string;
};

function comLimite<T>(promessa: Promise<T>, etapa: string) {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(
      () => reject(new Error(`Tempo esgotado (${LIMITE_MS / 1000}s) em: ${etapa}`)), LIMITE_MS);
    promessa.then(
      (valor) => { window.clearTimeout(id); resolve(valor); },
      (erro) => { window.clearTimeout(id); reject(erro); });
  });
}

/** Full-range BT.601 matrix. Drone orthophotos almost always arrive as JPEG with
 *  photometric=YCbCr, and the geotiff.js decoder hands back raw Y, Cb and Cr in the three
 *  channels when read through readRasters — which is the WebGLTile path. Without this,
 *  grass comes out pink. The conversion costs nothing by running in the shader. */
function corDeYCbCr() {
  const y = ["band", 1];
  const cb = ["-", ["band", 2], 128];
  const cr = ["-", ["band", 3], 128];
  return ["color",
    ["+", y, ["*", cr, 1.402]],
    ["+", y, ["*", cb, -0.344136], ["*", cr, -0.714136]],
    ["+", y, ["*", cb, 1.772]],
  ];
}

function inteiro(valor: number) {
  return Math.round(valor).toLocaleString("pt-BR");
}

export default function CogRecorte({ origem, nome, copy, onCancelar, onPronto }: CogRecorteProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const limpaRef = useRef<(() => void) | null>(null);
  const mapaRef = useRef<OlMapa | null>(null);
  const desenhoRef = useRef<OlDesenho | null>(null);
  const metaRef = useRef<MetadadosCog | null>(null);
  const faixaRef = useRef<{ min: number; max: number } | null>(null);
  const caixaRef = useRef<Janela | null>(null);
  const modoRef = useRef<Modo>("visivel");

  const [meta, setMeta] = useState<MetadadosCog | null>(null);
  const [fase, setFase] = useState<"lendo" | "pronto" | "erro">("lendo");
  const [etapa, setEtapa] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>("visivel");
  const [janela, setJanela] = useState<Janela | null>(null);
  const [gerando, setGerando] = useState(false);
  // The source can change mid-session: converting to COG replaces the File with the
  // address served by the helper, and the viewer remounts on top of it.
  const [fonte, setFonte] = useState<File | string>(origem);
  const [conversor, setConversor] = useState<"desconhecido" | "ativo" | "ausente">("desconhecido");
  const [conversao, setConversao] = useState<Trabalho | null>(null);
  const [segundos, setSegundos] = useState(0);
  const endpoint = typeof window === "undefined"
    ? CONVERSOR_PADRAO
    : localStorage.getItem(CHAVE_CONVERSOR) || localStorage.getItem(CHAVE_CONVERSOR_LEGADA) || CONVERSOR_PADRAO;

  // Map extent → pixel window of the file. It is the only conversion this component has
  // to do on its own; the rest lives in lib/cog.
  const janelaDe = useCallback((extent: number[]): Janela | null => {
    const m = metaRef.current;
    if (!m) return null;
    const x0 = Math.max(0, (extent[0] - m.origemX) / m.escalaX);
    const x1 = Math.min(m.largura, (extent[2] - m.origemX) / m.escalaX);
    const y0 = Math.max(0, (m.origemY - extent[3]) / m.escalaY);
    const y1 = Math.min(m.altura, (m.origemY - extent[1]) / m.escalaY);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }, []);

  const atualizaJanela = useCallback(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    if (modoRef.current === "retangulo") {
      setJanela(caixaRef.current);
      return;
    }
    const tamanho = mapa.getSize();
    if (!tamanho) return;
    setJanela(janelaDe(mapa.getView().calculateExtent(tamanho)));
  }, [janelaDe]);

  useEffect(() => () => limpaRef.current?.(), []);

  useEffect(() => {
    let cancelado = false;
    // Switching source remounts the map; without discarding the previous one, two canvases
    // and two render loops would be fighting over the same div.
    limpaRef.current?.();
    limpaRef.current = null;
    (async () => {
      try {
        setEtapa(copy.cogStepLibrary);
        const [
          { default: MapaOl }, { default: View }, { default: WebGLTileLayer },
          { default: GeoTIFF }, { default: VectorLayer }, { default: VectorSource },
          { default: Draw, createBox }, { Style, Stroke, Fill }, { always },
        ] = await Promise.all([
          import("ol/Map.js"), import("ol/View.js"), import("ol/layer/WebGLTile.js"),
          import("ol/source/GeoTIFF.js"), import("ol/layer/Vector.js"), import("ol/source/Vector.js"),
          import("ol/interaction/Draw.js"), import("ol/style.js"), import("ol/events/condition.js"),
        ]);

        setEtapa(copy.cogStepHeader);
        const dados = await comLimite(leMetadados(fonte), copy.cogStepHeader);
        if (cancelado) return;
        metaRef.current = dados;
        setMeta(dados);

        // A single band (elevation, NDVI, mask) has no mapping to RGB: without an explicit
        // ramp WebGLTile paints everything black, because it reads altitude in metres as a
        // colour component from 0 to 255. The range measured here applies to the preview and
        // to the crop, otherwise the user annotates one image and receives another.
        let faixa: { min: number; max: number } | null = null;
        if (dados.bandas === 1) {
          setEtapa(copy.cogStepBand);
          // The last level is the coarsest overview; reading from it costs a few KB.
          const grossa = await dados.tiff.getImage(dados.niveis[dados.niveis.length - 1]);
          const rasters = await comLimite(grossa.readRasters(), copy.cogStepBand) as unknown as Array<ArrayLike<number>>;
          faixa = medeFaixa(rasters[0], dados.semDado);
          faixaRef.current = faixa;
        }

        const diretorio = (await dados.tiff.getImage(0) as unknown as {
          fileDirectory?: { getValue?: (nome: string) => unknown } & Record<string, unknown>;
        }).fileDirectory;
        const photometric = typeof diretorio?.getValue === "function"
          ? diretorio.getValue("PhotometricInterpretation")
          : diretorio?.PhotometricInterpretation;
        const ycbcr = dados.bandas === 3 && photometric === 6;

        const base = typeof fonte === "string" ? { url: fonte } : { blob: fonte };
        const source = new GeoTIFF({
          sources: [dados.semDado !== null ? { ...base, nodata: dados.semDado } : base],
          interpolate: true,
          // The default normalisation rescales everything to 0–1 and breaks the relation
          // to the real unit, which the ramp and the YCbCr matrix need to keep.
          ...(faixa || ycbcr ? { normalize: false } : {}),
        });

        setEtapa(copy.cogStepTiles);
        const viewConfig = await comLimite(source.getView(), copy.cogStepTiles);
        if (cancelado) return;

        const selecao = new VectorSource();
        const estilo = new Style({
          stroke: new Stroke({ color: "#44C995", width: 2.5 }),
          fill: new Fill({ color: "rgba(68,201,149,0.14)" }),
        });

        const mapa = new MapaOl({
          target: hostRef.current!,
          layers: [
            new WebGLTileLayer({
              source,
              ...(faixa ? {
                style: {
                  color: ["interpolate", ["linear"], ["band", 1],
                    faixa.min, [16, 22, 19],
                    (faixa.min + faixa.max) / 2, [104, 148, 124],
                    faixa.max, [242, 246, 243]],
                },
              } : ycbcr ? { style: { color: corDeYCbCr() } } : {}),
            }),
            new VectorLayer({ source: selecao, style: estilo }),
          ],
          view: new View(viewConfig),
        });
        mapaRef.current = mapa;

        // Box by dragging. The OpenLayers default asks for two clicks and leaves dragging
        // to the pan; that is the opposite of what a crop selection suggests, and the user
        // has already framed the region in "visible area" mode before getting here.
        const desenho = new Draw({
          source: selecao, type: "Circle", geometryFunction: createBox(),
          style: estilo, freehandCondition: always,
        });
        desenho.on("drawstart", () => selecao.clear());
        desenho.on("drawend", (evento) => {
          const extent = evento.feature.getGeometry()?.getExtent();
          if (extent) {
            caixaRef.current = janelaDe(extent);
            setJanela(caixaRef.current);
          }
        });
        desenho.setActive(false);
        mapa.addInteraction(desenho);
        desenhoRef.current = desenho;

        mapa.on("moveend", atualizaJanela);
        mapa.once("rendercomplete", atualizaJanela);

        limpaRef.current = () => {
          mapaRef.current = null;
          desenhoRef.current = null;
          mapa.setTarget(undefined);
          mapa.dispose();
        };
        setFase("pronto");
        setEtapa("");
      } catch (falha) {
        if (cancelado) return;
        setErro(falha instanceof Error ? falha.message : String(falha));
        setFase("erro");
      }
    })();
    return () => { cancelado = true; };
  }, [fonte, copy, janelaDe, atualizaJanela]);

  useEffect(() => {
    modoRef.current = modo;
    desenhoRef.current?.setActive(modo === "retangulo");
    if (modo === "retangulo") setJanela(caixaRef.current);
    else atualizaJanela();
  }, [modo, atualizaJanela]);

  // Only look for the helper when it would solve something: for a complete COG the
  // conversion changes nothing, and a pointless probe just logs an error for the user.
  useEffect(() => {
    if (!meta || meta.perfil === "complete") return;
    let vivo = true;
    const controle = new AbortController();
    const tempo = window.setTimeout(() => controle.abort(), 4000);
    fetch(`${endpoint}/health`, { signal: controle.signal })
      .then((resposta) => { if (vivo) setConversor(resposta.ok ? "ativo" : "ausente"); })
      .catch(() => { if (vivo) setConversor("ausente"); })
      .finally(() => window.clearTimeout(tempo));
    return () => { vivo = false; controle.abort(); };
  }, [meta, endpoint]);

  // Conversion clock: with no real percentage coming from GDAL, the elapsed time next to
  // the estimate is the honest information.
  useEffect(() => {
    if (conversao?.estado !== "convertendo") return;
    const id = window.setInterval(() => setSegundos((valor) => valor + 1), 1000);
    return () => window.clearInterval(id);
  }, [conversao?.estado]);

  async function converte() {
    if (typeof fonte === "string" || conversao?.estado === "convertendo") return;
    setSegundos(0);
    setErro(null);
    try {
      const corpo = new FormData();
      corpo.append("arquivo", fonte, nome);
      const resposta = await fetch(`${endpoint}/converter`, { method: "POST", body: corpo });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      let trabalho = await resposta.json() as Trabalho;
      setConversao(trabalho);
      // With no percentage from GDAL, all that is left is asking. Five seconds is short
      // enough to look alive and long enough not to drown the helper for 11 minutes.
      while (trabalho.estado === "convertendo") {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        const atual = await fetch(`${endpoint}/trabalhos/${trabalho.id}`);
        if (!atual.ok) throw new Error(`HTTP ${atual.status}`);
        trabalho = await atual.json() as Trabalho;
        setConversao(trabalho);
      }
      if (trabalho.estado === "erro") throw new Error(trabalho.detalhe || "falha na conversão");
      // The helper serves the result with Range, so the viewer reads by tiles again.
      setFase("lendo");
      setJanela(null);
      caixaRef.current = null;
      setFonte(`${endpoint}${trabalho.url}`);
    } catch (falha) {
      setConversao(null);
      setErro(falha instanceof Error ? falha.message : String(falha));
    }
  }

  const previsao = janela ? dimensionaRecorte(janela.w, janela.h) : null;

  async function confirma() {
    if (!janela || gerando) return;
    setGerando(true);
    try {
      const recorte = await geraRecorte(fonte, nome, janela, faixaRef.current);
      onPronto(recorte, nome);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : String(falha));
      setFase("erro");
    } finally {
      setGerando(false);
    }
  }

  return <div className="modal-backdrop cog-crop-backdrop">
    <section className="cog-crop" role="dialog" aria-modal="true" aria-labelledby="cog-crop-title">
      <header>
        <div>
          <h2 id="cog-crop-title">{copy.cogCropTitle}</h2>
          <p>{fase === "lendo" ? etapa : fase === "erro" ? copy.cogFailed : copy.cogCropHint}</p>
        </div>
        <button onClick={onCancelar} aria-label={copy.close}>×</button>
      </header>

      {fase === "lendo" && <div className="cog-crop-progress" role="progressbar" aria-label={etapa}><i /></div>}

      {erro && <div className="cog-crop-erro" role="alert">
        <b>{copy.cogFailed}</b>
        <p>{erro}</p>
        <p className="cog-crop-dica">{copy.cogFailedHint}</p>
      </div>}

      {meta && meta.perfil !== "complete" && <div className="cog-crop-aviso" role="status">
        <b>{fill(copy.cogNotOptimized, { profile: copy[ROTULO_PERFIL[meta.perfil]] })}</b>
        <p>{copy.cogNotOptimizedHint}</p>
        {conversao?.estado === "convertendo" ? <p className="cog-crop-convertendo">
          <i className="cog-crop-girando" aria-hidden="true" />
          {fill(copy.convRunning, {
            elapsed: `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`,
            estimate: estimaMinutos(conversao.megapixels ?? 0),
          })}
        </p> : conversor === "ativo" && typeof fonte !== "string" ? <div className="cog-crop-converter">
          <button onClick={() => void converte()}>{copy.convButton}</button>
          <small>{fill(copy.convEstimate, {
            minutes: estimaMinutos((meta.largura * meta.altura) / 1e6),
          })}</small>
        </div> : conversor === "ausente" ? <p className="cog-crop-instala">
          {copy.convUnavailable} <a href="/poligome-cog-local.py" download>poligome-cog-local.py</a>
        </p> : null}
      </div>}

      <div className="cog-crop-corpo">
        <div className="cog-crop-mapa" ref={hostRef} />
        <aside>
          <h3>{copy.cogFileSection}</h3>
          <dl>
            <dt>{copy.cogPixels}</dt><dd>{meta ? `${inteiro(meta.largura)} × ${inteiro(meta.altura)}` : "—"}</dd>
            <dt>{copy.cogCrs}</dt><dd>{meta?.crs ?? "—"}</dd>
            <dt>{copy.cogBands}</dt><dd>{meta?.bandas ?? "—"}</dd>
            <dt>{copy.cogOverviews}</dt><dd>{meta?.overviews ?? "—"}</dd>
            <dt>{copy.cogProfile}</dt>
            <dd className={meta && meta.perfil !== "complete" ? "cog-bad" : ""}>{meta ? copy[ROTULO_PERFIL[meta.perfil]] : "—"}</dd>
          </dl>

          <h3>{copy.cogCropSection}</h3>
          {janela && previsao ? <dl>
            <dt>{copy.cogWindow}</dt><dd>{inteiro(janela.w)} × {inteiro(janela.h)} px</dd>
            <dt>{copy.cogResult}</dt><dd>{inteiro(previsao.largura)} × {inteiro(previsao.altura)} px</dd>
            <dt>{copy.cogDetail}</dt>
            <dd className={previsao.reducao > 1 ? "cog-warn" : ""}>
              {previsao.reducao <= 1.001
                ? copy.cogNative
                : fill(copy.cogReduced, { factor: previsao.reducao.toFixed(1) })}
            </dd>
            {meta && meta.escalaX > 0 && meta.crs !== "sem CRS" && <>
              <dt>{copy.cogGround}</dt>
              <dd>{(janela.w * meta.escalaX).toFixed(1)} × {(janela.h * meta.escalaY).toFixed(1)}</dd>
            </>}
          </dl> : <p className="cog-crop-vazio">
            {modo === "retangulo" ? copy.cogDrawPrompt : copy.cogNoWindow}
          </p>}
          <p className="cog-crop-nota">{fill(copy.cogCapNote, { side: 4096, mp: 12 })}</p>
        </aside>
      </div>

      <footer>
        <div className="cog-crop-modos">
          <button className={modo === "visivel" ? "on" : ""} onClick={() => setModo("visivel")}>
            {copy.cogModeVisible}
          </button>
          <button className={modo === "retangulo" ? "on" : ""} onClick={() => setModo("retangulo")}>
            {copy.cogModeRect}
          </button>
        </div>
        <div className="cog-crop-acoes">
          <button onClick={onCancelar}>{copy.cancel}</button>
          <button className="primary" disabled={!janela || gerando || fase !== "pronto"} onClick={() => void confirma()}>
            {gerando ? copy.cogGenerating : copy.cogUseCrop}
          </button>
        </div>
      </footer>
    </section>
  </div>;
}

export { ehArquivoTiff };
