# migration-helper

MySQL 8 conversion of a PostgreSQL dump, plus a loader for Hostinger MySQL.

## Contents

| file | size | INSERT batches |
| --- | --- | --- |
| `sql/data_part_00.{00,01,02}.sql` | 45 MB total | 239 |
| `sql/data_part_01.{00,01,02}.sql` | 45 MB total | 397 |
| `sql/data_part_02.{00,01,02}.sql` | 45 MB total | 146 |
| `sql/data_part_03.00.sql` | 10 MB | 44 |
| `load.sh` | | ordered loader (schema -> data -> FKs) |
| `.env.example` | | connection template |

Still to add: `sql/01_schema.sql` and `sql/03_foreign_keys.sql`. The data files
assume the schema already exists.

## Load

```bash
cp .env.example .env    # fill in Hostinger MySQL host/user/password/db
./load.sh
```

Each original 45 MB dump was split at statement boundaries into ~15-22 MB
chunks (`data_part_NN.MM.sql`) so it stays under GitHub's per-file API limit.
Each chunk is valid standalone SQL and `load.sh` loads them in filename order.

Each data file begins with `SET FOREIGN_KEY_CHECKS=0; SET UNIQUE_CHECKS=0; SET autocommit=0;`
and commits in chunks. `--max-allowed-packet=1G` is required because some
INSERT batches are multi-megabyte.

Hostinger notes:
- Enable hPanel -> Databases -> Remote MySQL and whitelist the connecting IP (or `%`).
- Host is usually `srvNNN.hstgr.io`, port `3306`.
- phpMyAdmin import cannot handle 45 MB files; use CLI/SSH.

## Conversion reference

`uuid -> char(36)`, `text -> longtext` (`varchar(255)` when indexed),
`jsonb/json -> json`, arrays -> JSON arrays, `boolean -> tinyint(1)`,
`timestamptz -> datetime(6)` (UTC, offsets stripped), `bytea -> longblob` (UNHEX),
`numeric -> decimal`, Postgres enums -> MySQL `ENUM`, `nextval` -> `AUTO_INCREMENT`,
generated columns kept as `STORED`.

Not converted (manual porting required):
- 65 PL/pgSQL functions and their triggers
- Row Level Security policies and role grants (MySQL has no RLS - enforce in the app)
- 14 views (Postgres-specific syntax)
- GIN / partial / expression indexes (plain btree kept)

## Security

These dumps contain application data and a config table with a live secret
value (`_cron_config`). Keep this repository **private** and rotate any
credential that appears in the data.


---
Verified by Lovable on 2026-09-10T07:58:50.483473+00:00.
