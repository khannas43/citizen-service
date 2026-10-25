#!/usr/bin/env python3
"""Turn a state pack into idempotent SQL for the platform schema.

    python3 scripts/load_state_pack.py state-packs/TG > /tmp/tg.sql
    psql -d citizen_db -v ON_ERROR_STOP=1 -f /tmp/tg.sql        # as the Postgres superuser

A pack is a folder:
    pack.json                 state facts: code, name_en, name_local, languages, labels ...   (required)
    lgd/districts.csv         Local Government Directory (LGD) exports; header names are matched loosely
    lgd/subdistricts.csv
    lgd/villages.csv          (optional, large)
    schemes.csv               level,code,name_en[,name_local_json]                              (optional)
    i18n_<lang>.csv           key,text                                                          (optional)

Only the standard library is used. Re-running a pack updates it in place.
"""
import csv, json, re, sys, os, zipfile, itertools
import xml.etree.ElementTree as ET

def q(v):
    return "NULL" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"

def norm(h):
    return re.sub(r"[^a-z0-9]", "", h.lower())

def clean(v):
    return re.sub(r"\s+", " ", (v or "").strip())

def pick(headers, must, must_not=()):
    """first header whose normalised form contains all of `must` and none of `must_not`"""
    for h in headers:
        n = norm(h)
        if all(m in n for m in must) and not any(x in n for x in must_not):
            return h
    return None

_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

def _cell_text(c, shared):
    t = c.get("t")
    if t == "inlineStr":
        return "".join(x.text or "" for x in c.iter(_NS + "t"))
    v = c.find(_NS + "v")
    if v is None or v.text is None:
        return ""
    return shared[int(v.text)] if t == "s" else v.text

def _col(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1

def xlsx_rows(path):
    """Stream the first sheet of an .xlsx file as dicts. The header is the first row with at least three filled cells
    (LGD exports start with a title row). Memory use stays small even for the 500 MB all-India village file."""
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(_NS + "si"):
            shared.append("".join(t.text or "" for t in si.iter(_NS + "t")))
    header = None
    with z.open("xl/worksheets/sheet1.xml") as f:
        for _, el in ET.iterparse(f):
            if el.tag != _NS + "row":
                continue
            cells = {}
            for c in el.findall(_NS + "c"):
                cells[_col(c.get("r"))] = _cell_text(c, shared)
            el.clear()
            width = (max(cells) + 1) if cells else 0
            row = [cells.get(i, "") for i in range(width)]
            if header is None:
                if sum(1 for x in row if x.strip()) >= 3:
                    header = [x.strip() for x in row]
                continue
            yield dict(zip(header, row))

def read_table(path):
    """rows of a .csv or .xlsx file as dicts (a generator)"""
    if path.lower().endswith(".xlsx"):
        yield from xlsx_rows(path)
    else:
        with open(path, newline="", encoding="utf-8-sig") as f:
            yield from csv.DictReader(f)

def read_csv(path):
    return list(read_table(path))

def find_table(folder, stem):
    for ext in (".csv", ".xlsx"):
        p = os.path.join(folder, stem + ext)
        if os.path.exists(p):
            return p
    return None

def code_text(v):
    """LGD spreadsheets store codes as numbers: '603.0' -> '603'"""
    v = clean(v)
    return v[:-2] if re.fullmatch(r"\d+\.0", v) else v

def lgd_rows(path, level, lgd_state, local_lang):
    it = read_table(path)
    first = next(it, None)
    if first is None:
        return []
    rows = itertools.chain([first], it)
    H = list(first.keys())
    if level == 1:
        c_code, c_name = pick(H, ["district", "code"], ["sub", "census", "state"]), pick(H, ["district", "name"], ["sub", "state", "local"])
        c_pd = c_pc = c_gd = c_gc = None
    elif level == 2:
        c_code, c_name = pick(H, ["subdistrict", "code"], ["census"]), pick(H, ["subdistrict", "name"], ["local"])
        c_pc, c_pd = pick(H, ["district", "code"], ["sub", "census"]), pick(H, ["district", "name"], ["sub", "local"])
        c_gc = c_gd = None
    else:
        c_code, c_name = pick(H, ["village", "code"], ["census"]), pick(H, ["village", "name"], ["local"])
        c_pc, c_pd = pick(H, ["subdistrict", "code"], ["census"]), pick(H, ["subdistrict", "name"], ["local"])
        c_gc, c_gd = pick(H, ["district", "code"], ["sub", "census"]), pick(H, ["district", "name"], ["sub", "local"])
    c_local = pick(H, ["name", "local"]) or pick(H, ["name", "regional"])
    c_state = pick(H, ["state", "code"], ["census"])
    if not c_name:
        sys.exit(f"{path}: cannot find a name column in {H}")
    out = []
    for r in rows:
        if lgd_state and c_state and code_text(r.get(c_state)) != str(lgd_state):
            continue
        name = clean(r.get(c_name))
        if not name:
            continue
        out.append({
            "level": level, "lgd": code_text(r.get(c_code)) if c_code else "",
            "name": name, "local": clean(r.get(c_local)) if c_local else "",
            "p_lgd": code_text(r.get(c_pc)) if c_pc else "", "p_name": clean(r.get(c_pd)) if c_pd else "",
            "g_lgd": code_text(r.get(c_gc)) if c_gc else "", "g_name": clean(r.get(c_gd)) if c_gd else "",
        })
    return out

def main(pack_dir):
    meta = json.load(open(os.path.join(pack_dir, "pack.json"), encoding="utf-8"))
    code = meta["code"]
    assert re.fullmatch(r"[A-Z]{2}", code), "pack.json code must be two capital letters"
    st = meta.get("state_row", {})
    sql = ["-- generated by scripts/load_state_pack.py from " + pack_dir, "BEGIN;"]

    sql.append(
        "INSERT INTO platform.state (code, name_en, name_local, languages, default_lang, digit_tenant_id, admin_level_labels, id_formats) VALUES ("
        f"{q(code)}, {q(meta['name_en'])}, {q(json.dumps(meta.get('name_local', {}), ensure_ascii=False))}::jsonb, "
        f"'{{{','.join(meta.get('languages', ['en']))}}}', {q(meta.get('default_lang', 'en'))}, {q(meta.get('digit_tenant_id'))}, "
        f"{q(json.dumps(meta.get('admin_level_labels', {})))}::jsonb, {q(json.dumps(meta.get('id_formats', {})))}::jsonb) "
        "ON CONFLICT (code) DO UPDATE SET name_en=EXCLUDED.name_en, name_local=EXCLUDED.name_local, languages=EXCLUDED.languages, "
        "default_lang=EXCLUDED.default_lang, digit_tenant_id=EXCLUDED.digit_tenant_id, admin_level_labels=EXCLUDED.admin_level_labels, "
        "id_formats=EXCLUDED.id_formats;")

    levels = []
    for lvl, stem in ((1, "districts"), (2, "subdistricts"), (3, "villages")):
        p = find_table(os.path.join(pack_dir, "lgd"), stem)
        if p:
            levels += lgd_rows(p, lvl, meta.get("lgd_state_code"), meta.get("local_lang"))
    if levels:
        sql.append("CREATE TEMP TABLE stage (level int, lgd text, name text, local text, p_lgd text, p_name text, g_lgd text, g_name text) ON COMMIT DROP;")
        sql.append("COPY stage FROM STDIN WITH (FORMAT csv, NULL '<<none>>');")
        buf = []
        for r in levels:
            buf.append([r["level"], r["lgd"], r["name"], r["local"], r["p_lgd"], r["p_name"], r["g_lgd"], r["g_name"]])
        import io
        s = io.StringIO(); cw = csv.writer(s, lineterminator="\n"); cw.writerows(buf)
        sql.append(s.getvalue().rstrip("\n")); sql.append("\\.")
        lc = q(meta.get("local_lang") or "local")
        kind = {1: "district", 2: "sub-district", 3: "village"}
        def upsert(level, kind_name, src):
            """src = SELECT yielding parent_id, lgd, name, local for this level"""
            local = f"CASE WHEN local = '' THEN '{{}}'::jsonb ELSE jsonb_build_object({lc}, local) END"
            sql.append(f"""
-- {kind_name}s with an LGD code: the code is the identity
INSERT INTO platform.admin_unit (state_code, level, parent_id, lgd_code, name_en, name_local, kind)
SELECT DISTINCT ON (lgd) {q(code)}, {level}, parent_id, lgd, name, {local}, '{kind_name}'
FROM ({src}) x WHERE lgd IS NOT NULL ORDER BY lgd
ON CONFLICT (state_code, level, lgd_code) WHERE lgd_code IS NOT NULL
DO UPDATE SET parent_id = EXCLUDED.parent_id, name_en = EXCLUDED.name_en,
              name_local = platform.admin_unit.name_local || EXCLUDED.name_local;
-- {kind_name}s without a code: parent and name are the identity
INSERT INTO platform.admin_unit (state_code, level, parent_id, lgd_code, name_en, name_local, kind)
SELECT DISTINCT ON (coalesce(parent_id,0), name) {q(code)}, {level}, parent_id, NULL, name, {local}, '{kind_name}'
FROM ({src}) x WHERE lgd IS NULL ORDER BY coalesce(parent_id,0), name
ON CONFLICT (state_code, level, (coalesce(parent_id,0)), name_en) WHERE lgd_code IS NULL
DO UPDATE SET name_local = platform.admin_unit.name_local || EXCLUDED.name_local;""")

        upsert(1, "district",
               "SELECT NULL::bigint AS parent_id, nullif(lgd,'') AS lgd, name, local FROM stage WHERE level = 1")
        upsert(2, "sub-district",
               f"SELECT d.id AS parent_id, nullif(s.lgd,'') AS lgd, s.name, s.local FROM stage s JOIN platform.admin_unit d "
               f"ON d.state_code = {q(code)} AND d.level = 1 "
               "AND ((s.p_lgd <> '' AND d.lgd_code = s.p_lgd) OR (s.p_lgd = '' AND lower(d.name_en) = lower(s.p_name))) "
               "WHERE s.level = 2")
        upsert(3, "village",
               f"SELECT sd.id AS parent_id, nullif(s.lgd,'') AS lgd, s.name, s.local FROM stage s "
               f"JOIN platform.admin_unit sd ON sd.state_code = {q(code)} AND sd.level = 2 "
               "AND ((s.p_lgd <> '' AND sd.lgd_code = s.p_lgd) OR (s.p_lgd = '' AND lower(sd.name_en) = lower(s.p_name))) "
               "JOIN platform.admin_unit d ON d.id = sd.parent_id AND (s.g_name = '' OR lower(d.name_en) = lower(s.g_name)) "
               "WHERE s.level = 3")

    sp = os.path.join(pack_dir, "schemes.csv")
    if os.path.exists(sp):
        for r in read_csv(sp):
            lvl = clean(r["level"]).upper()
            sc = "NULL" if lvl == "CENTRAL" else q(code)
            nl = q(r.get("name_local_json") or "{}")
            ver = "true" if clean(r.get("verified", "")).lower() in ("true", "yes", "1") else "false"
            sql.append(
                "INSERT INTO platform.scheme_catalog (state_code, level, code, name_en, name_local, category, source_url, verified) VALUES "
                f"({sc}, {q(lvl)}, {q(clean(r['code']))}, {q(clean(r['name_en']))}, {nl}::jsonb, {q(clean(r.get('category', '')))}, "
                f"{q(clean(r.get('source_url', '')))}, {ver}) "
                "ON CONFLICT (coalesce(state_code,'--'), code) DO UPDATE SET name_en=EXCLUDED.name_en, name_local=EXCLUDED.name_local, "
                "category=EXCLUDED.category, source_url=EXCLUDED.source_url, verified=EXCLUDED.verified;")
    for fn in sorted(os.listdir(pack_dir)):
        m = re.fullmatch(r"i18n_([a-z]{2,3})\.csv", fn)
        if m:
            for r in read_csv(os.path.join(pack_dir, fn)):
                sql.append(
                    "INSERT INTO platform.i18n_label (state_code, lang, key, text) VALUES "
                    f"({q(code)}, {q(m.group(1))}, {q(r['key'])}, {q(r['text'])}) "
                    "ON CONFLICT (coalesce(state_code,'--'), lang, key) DO UPDATE SET text=EXCLUDED.text;")
    sql.append("COMMIT;")
    sys.stdout.write("\n".join(sql) + "\n")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
