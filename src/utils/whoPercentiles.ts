import * as XLSX from "xlsx";

type SexCode = "M" | "F";

function getDiffDaysCeil(birthDateIso: string, referenceDateIso: string) {
  const birth = new Date(birthDateIso);
  const reference = new Date(referenceDateIso);
  if (isNaN(birth.getTime()) || isNaN(reference.getTime())) return null;

  const diffTime = Math.abs(reference.getTime() - birth.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function percentileFromWhoCategory(category: unknown): string | null {
  const raw = typeof category === "string" ? category.trim() : "";
  if (!raw) return null;

  // Le tabelle WHO usano categorie tipo: P1, P3, P5, P10, P50, P97, P99, P999, P01
  const match = raw.match(/^P(.+)$/);
  if (!match) return null;

  const code = match[1];
  if (code === "01") return "0.1";
  if (code === "999") return "99.9";

  // Usualmente il resto è già il centile: "1", "3", "5", "10", ..., "99"
  return code;
}

type WhoPlotPoint = {
  min: number;
  max: number;
  dependentValues: Array<{
    min: number;
    max: number;
    category: string;
    value: number;
  }>;
};

type WhoPlot = {
  mainIdentifierName: string;
  plot: WhoPlotPoint[];
};

const whoPlotCache = new Map<string, WhoPlot>();

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const n = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : NaN;
}

function buildPlotFromDataObject(dataObject: any[][]): WhoPlot {
  const header = dataObject[0] ?? [];
  const categories: string[] = (header.slice(5) ?? []).map((c) => String(c));
  const identifierName = String(header[0] ?? "");

  const rows = dataObject.slice(1).map((row) => row.slice(5));
  const mainIdentifierValues = dataObject.slice(1).map((row) => asNumber(row[0]));

  const plot: WhoPlotPoint[] = mainIdentifierValues.map((mainIdentifierValue, mainIdentifierIndex) => {
    const min = mainIdentifierIndex - 1 < 0 ? -Infinity : mainIdentifierValue;
    const max =
      mainIdentifierIndex + 1 === mainIdentifierValues.length
        ? Infinity
        : (mainIdentifierValues[mainIdentifierIndex + 1] as number) - 0.001;

    const dependentValuesForMainIdentifier = rows[mainIdentifierIndex] ?? [];

    const dependentValues = dependentValuesForMainIdentifier.map((dependentValue, dependentValueIndex) => {
      const value = asNumber(dependentValue);
      const category = categories[dependentValueIndex] ?? "";

      const depMin = dependentValueIndex - 1 < 0 ? -Infinity : value;
      const depMax =
        dependentValueIndex + 1 === dependentValuesForMainIdentifier.length
          ? Infinity
          : asNumber(dependentValuesForMainIdentifier[dependentValueIndex + 1]) - 0.001;

      return { value, min: depMin, max: depMax, category };
    });

    return { min, max, dependentValues };
  });

  return { mainIdentifierName: identifierName, plot };
}

function matchCategory(plot: WhoPlot, mainIdentifierValue: number, dependentValue: number): string {
  let foundMain: WhoPlotPoint | null = null;
  for (const p of plot.plot) {
    if (p.min === -Infinity) {
      if (mainIdentifierValue <= p.max) {
        foundMain = p;
        break;
      }
    } else if (p.max === Infinity) {
      if (mainIdentifierValue >= p.min) {
        foundMain = p;
        break;
      }
    } else {
      if (mainIdentifierValue >= p.min && mainIdentifierValue <= p.max) {
        foundMain = p;
        break;
      }
    }
  }

  if (!foundMain) {
    throw new Error(`Could not match a valid value (${mainIdentifierValue}) for "${plot.mainIdentifierName}"`);
  }

  let foundCategory: string | null = null;
  for (const dv of foundMain.dependentValues) {
    if (dv.min === -Infinity) {
      if (dependentValue <= dv.max) {
        foundCategory = dv.category;
        break;
      }
    } else if (dv.max === Infinity) {
      if (dependentValue >= dv.min) {
        foundCategory = dv.category;
        break;
      }
    } else {
      if (dependentValue >= dv.min && dependentValue <= dv.max) {
        foundCategory = dv.category;
        break;
      }
    }
  }

  if (!foundCategory) {
    throw new Error(`Could not match a category for the value "${dependentValue}"`);
  }

  return foundCategory;
}

async function loadWhoPlotFromUrl(url: string): Promise<WhoPlot> {
  const cached = whoPlotCache.get(url);
  if (cached) return cached;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch WHO table: ${url} (${res.status})`);

  const buf = await res.arrayBuffer();
  const workbook = XLSX.read(buf, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const dataObject = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

  const plot = buildPlotFromDataObject(dataObject);
  whoPlotCache.set(url, plot);
  return plot;
}

function getMonthsAge(birthDateIso: string, referenceDateIso: string): number | null {
  const diffDays = getDiffDaysCeil(birthDateIso, referenceDateIso);
  if (diffDays == null) return null;
  return Math.floor(diffDays / 30);
}

function getSexKey(sex: SexCode): "boys" | "girls" {
  return sex === "M" ? "boys" : "girls";
}

function whoFileUrl(kind: "peso" | "altezza", sex: SexCode, monthsAge: number): string {
  const sexKey = getSexKey(sex);

  if (kind === "peso") {
    if (monthsAge <= 60) {
      return new URL(
        `../../node_modules/who-growth/resources/WHODocuments/weightForAge/tab_wfa_${sexKey}_p_0_5.xlsx`,
        import.meta.url
      ).href;
    }

    // file WHO 2007 percentile (per i pesi 5-10 anni)
    if (sex === "M") {
      return new URL(
        `../../node_modules/who-growth/resources/WHODocuments/weightForAge/hfa-boys-perc-who2007-exp_07eb5053-9a09-4910-aa6b-c7fb28012ce6.xlsx`,
        import.meta.url
      ).href;
    }
    return new URL(
      `../../node_modules/who-growth/resources/WHODocuments/weightForAge/hfa-girls-perc-who2007-exp_6040a43e-81da-48fa-a2d4-5c856fe4fe71.xlsx`,
      import.meta.url
    ).href;
  }

  // kind === "altezza"
  if (monthsAge <= 24) {
    return new URL(
      `../../node_modules/who-growth/resources/WHODocuments/heightForAge/tab_lhfa_${sexKey}_p_0_2.xlsx`,
      import.meta.url
    ).href;
  }
  if (monthsAge <= 60) {
    return new URL(
      `../../node_modules/who-growth/resources/WHODocuments/heightForAge/tab_lhfa_${sexKey}_p_2_5.xlsx`,
      import.meta.url
    ).href;
  }

  // 2007 heights percentiles
  if (sex === "M") {
    return new URL(
      `../../node_modules/who-growth/resources/WHODocuments/heightForAge/hfa-boys-perc-who2007-exp.xlsx`,
      import.meta.url
    ).href;
  }
  return new URL(
    `../../node_modules/who-growth/resources/WHODocuments/heightForAge/hfa-girls-perc-who2007-exp.xlsx`,
    import.meta.url
  ).href;
}

export async function computeWhoPercentilePeso(params: {
  birthDateIso: string;
  referenceDateIso: string;
  sex: SexCode;
  weightKg: number;
}): Promise<string | null> {
  if (!Number.isFinite(params.weightKg)) return null;

  const monthsAge = getMonthsAge(params.birthDateIso, params.referenceDateIso);
  if (monthsAge == null || !Number.isFinite(monthsAge)) return null;

  const fileUrl = whoFileUrl("peso", params.sex, monthsAge);
  try {
    const plot = await loadWhoPlotFromUrl(fileUrl);
    const category = matchCategory(plot, monthsAge, params.weightKg);
    return percentileFromWhoCategory(category);
  } catch {
    return null;
  }
}

export async function computeWhoPercentileAltezza(params: {
  birthDateIso: string;
  referenceDateIso: string;
  sex: SexCode;
  heightCm: number;
}): Promise<string | null> {
  if (!Number.isFinite(params.heightCm)) return null;

  const monthsAge = getMonthsAge(params.birthDateIso, params.referenceDateIso);
  if (monthsAge == null || !Number.isFinite(monthsAge)) return null;

  const fileUrl = whoFileUrl("altezza", params.sex, monthsAge);
  try {
    const plot = await loadWhoPlotFromUrl(fileUrl);
    const category = matchCategory(plot, monthsAge, params.heightCm);
    return percentileFromWhoCategory(category);
  } catch {
    return null;
  }
}

