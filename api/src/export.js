import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import archiver from "archiver";
import { accessSql } from "./auth.js";

export const EXPORT_HEADERS = [
  "Bird","Lat/Lon","FileName","Address","Country","Close_city","Geo_desc","FilePath","Date_time",
  "Quality_selected","Pheno_period","Residence","Feather_perc","Feather_occ","Ciconia_num","Env_desc_en","Remarks",
  "Altitude","Fly_ground","Above_ground","Height_class_100m","Thermal_updraft","Activity_class","Agriculture_type",
  "Foraging_habitat_group","Roost_site_group","Period_day","Artificial_lights","Water_presence_class",
  "Spec1_abund","Spec1_name","Spec2_abund","Spec2_name","Altitude_m","GPS_time","Latitude","Longitude","Location_source","Elevation_m",
  "Analysed","Status","Updated_by","Updated_at"
];
const csvCell = (value) => {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
};
const xml = (value) => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");

export function rowToExport(row, publicApiUrl = "") {
  return {
    Bird:row.individual_id, "Lat/Lon":row.latitude != null && row.longitude != null ? `${row.latitude}, ${row.longitude}` : null,
    FileName:row.filename, Address:row.address, Country:row.country, Close_city:row.close_city, Geo_desc:row.geo_desc,
    FilePath:`${publicApiUrl}/api/public/photos/${encodeURIComponent(row.id)}/image`, Date_time:row.capture_time,
    Quality_selected:row.quality_selected, Pheno_period:row.pheno_period, Residence:row.residence, Feather_perc:row.feather_perc,
    Feather_occ:row.feather_occ, Ciconia_num:row.ciconia_num, Env_desc_en:row.env_desc_en, Remarks:row.remarks,
    Altitude:row.altitude, Fly_ground:row.fly_ground, Above_ground:row.above_ground, Height_class_100m:row.height_class_100m,
    Thermal_updraft:row.thermal_updraft, Activity_class:row.activity_class, Agriculture_type:row.agriculture_type,
    Foraging_habitat_group:row.foraging_habitat_group, Roost_site_group:row.roost_site_group, Period_day:row.period_day,
    Artificial_lights:row.artificial_lights, Water_presence_class:row.water_presence_class, Spec1_abund:row.spec1_abund,
    Spec1_name:row.spec1_name, Spec2_abund:row.spec2_abund, Spec2_name:row.spec2_name, Altitude_m:row.altitude_m,
    GPS_time:row.gps_time, Latitude:row.latitude, Longitude:row.longitude, Location_source:row.location_source, Elevation_m:row.elevation_m,
    Analysed:row.status === "complete" ? "yes" : "no", Status:row.status || "unstarted",
    Updated_by:row.updated_by_name, Updated_at:row.annotation_updated_at
  };
}

export async function queryExportRows(db, user, filters = {}) {
  const access = accessSql(user, "p.individual_id", 1);
  const params = [...access.params], where = [access.sql];
  const add = (sql, value) => { params.push(value); where.push(sql.replace("?", `$${params.length}`)); };
  if (filters.individualId) add("p.individual_id=?", filters.individualId);
  if (filters.status) add("COALESCE(a.status,'unstarted')=?", filters.status);
  if (filters.search) {
    const base = params.length, value = `%${filters.search}%`;
    params.push(value,value,value);
    where.push(`(p.filename ILIKE $${base+1} OR p.individual_id ILIKE $${base+2} OR COALESCE(a.remarks,'') ILIKE $${base+3})`);
  }
  const result = await db.query(
    `SELECT p.*,COALESCE(a.status,'unstarted') AS status,a.quality_selected,a.pheno_period,a.residence,a.feather_perc,
      a.feather_occ,a.ciconia_num,a.env_desc_en,a.remarks,a.altitude,a.fly_ground,a.above_ground,a.height_class_100m,
      a.thermal_updraft,a.activity_class,a.agriculture_type,a.foraging_habitat_group,a.roost_site_group,a.period_day,
      a.artificial_lights,a.water_presence_class,a.spec1_abund,a.spec1_name,a.spec2_abund,a.spec2_name,
      a.updated_by,a.updated_at AS annotation_updated_at,u.name AS updated_by_name
     FROM photos p LEFT JOIN photo_annotations a ON a.photo_id=p.id LEFT JOIN users u ON u.id=a.updated_by
     WHERE ${where.join(" AND ")} ORDER BY p.individual_id,p.capture_time NULLS LAST,p.filename`, params);
  return result.rows;
}

export function sendCsv(res, rows) {
  res.type("text/csv; charset=utf-8").attachment("stork-photo-data.csv");
  res.write("\uFEFF" + EXPORT_HEADERS.map(csvCell).join(",") + "\r\n");
  rows.forEach((row) => res.write(EXPORT_HEADERS.map((h)=>csvCell(row[h])).join(",") + "\r\n"));
  res.end();
}
export async function sendXlsx(res, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("photos", { views:[{state:"frozen",ySplit:1}] });
  sheet.columns = EXPORT_HEADERS.map((h)=>({header:h,key:h,width:Math.min(36,Math.max(12,h.length+2))}));
  rows.forEach((row)=>sheet.addRow(row));
  sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};
  sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF173A4B"}};
  sheet.autoFilter={from:"A1",to:`${sheet.getColumn(EXPORT_HEADERS.length).letter}1`};
  res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").attachment("stork-photo-data.xlsx");
  await workbook.xlsx.write(res); res.end();
}
export function sendGeoJson(res, rows) {
  const features = rows.filter((r)=>Number.isFinite(Number(r.Latitude))&&Number.isFinite(Number(r.Longitude))).map((r)=>({
    type:"Feature",geometry:{type:"Point",coordinates:[Number(r.Longitude),Number(r.Latitude)]},
    properties:Object.fromEntries(Object.entries(r).filter(([k])=>!["Latitude","Longitude"].includes(k)))
  }));
  res.attachment("stork-photo-data.geojson").json({type:"FeatureCollection",features});
}
export function sendKml(res, rows) {
  const points = rows.filter((r)=>Number.isFinite(Number(r.Latitude))&&Number.isFinite(Number(r.Longitude))).map((r)=>
    `<Placemark><name>${xml(r.FileName)}</name><description>${xml(`${r.Bird} • ${r.Status}`)}</description><Point><coordinates>${r.Longitude},${r.Latitude},0</coordinates></Point></Placemark>`).join("");
  res.type("application/vnd.google-earth.kml+xml").attachment("stork-photo-data.kml").send(`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${points}</Document></kml>`);
}
export function sendZip(res, sourceRows, rows, photoDir,filename="stork-photo-export.zip") {
  res.type("application/zip").attachment(filename);
  const archive=archiver("zip",{zlib:{level:6}}); archive.on("error",(e)=>res.destroy(e)); archive.pipe(res);
  const csv=[EXPORT_HEADERS.map(csvCell).join(","),...rows.map((r)=>EXPORT_HEADERS.map((h)=>csvCell(r[h])).join(","))].join("\r\n");
  archive.append("\uFEFF"+csv,{name:"stork-photo-data.csv"});
  const root=path.resolve(photoDir), used=new Set();
  for(const row of sourceRows){ if(!row.storage_path||used.has(row.storage_path))continue; const file=path.resolve(root,row.storage_path),rel=path.relative(root,file); if(rel.startsWith("..")||path.isAbsolute(rel)||!fs.existsSync(file))continue; used.add(row.storage_path); archive.file(file,{name:`photos/${row.individual_id}/${row.filename}`}); }
  archive.finalize();
}
