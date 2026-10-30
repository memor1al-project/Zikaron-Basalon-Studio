# The Helfgott family — an open example

A complete, working story catalog, published with the family's agreement so that anyone
can see what the Studio actually produces rather than having to take a description of it.

**This is the published copy, not the family's own.** The two are deliberately distinct:

| | The family's catalog | This one |
| --- | --- | --- |
| Where it lives | a folder on their machine, never committed | `examples/helfgot-open/` in this repository |
| Label | `helfgot` | `helfgot — open example` |
| `studio_meta.catalog_kind` | absent | `public-example` |
| Contents | everything they have gathered | four materials; one removed before publication |

The marker is inside the SQLite file itself, in the `studio_meta` table, so a copy found
loose on a disk in five years still says what it is.

## Who this is

**Rachel Helfgott**, later Rachel Shafrir, born in Stryj, Poland, on 4 May 1914. Her
father Moshe taught Hebrew and the household spoke it. She survived the Holocaust in
hiding in and around Stryj, reached Israel through Aliyah Bet by way of detention in
Cyprus, and settled at Kibbutz Afek.

## What is here

```
materials/
  rachel_helfgott_shafrir_The_War_Diary_.pdf   her own memoir, scanned
  I212.png  I217.png  1ba36e…g.png             family photographs
zikaron-metadata.sqlite                        the catalog
manifest.json                                  the export's bill of materials
```

The catalog carries what the Studio builds around those files: tags
(`Holocaust survival`, `Aliyah Bet`, `Stryj`, `Zionism`, `Cyprus detention camps`), a
place, notes written by the family, the text extracted from the diary, a summary of it,
and four named faces cropped from the photographs — `fishko`, `Edzia`, `rachel`, `Izak`.

It also carries eleven materials marked as removed from the story. That is not an
accident: it is what a real catalog looks like after someone has worked in it, and
removal in the Studio is reversible by design.

## What was taken out

One material: a recording of a **living** relative. Removed along with its catalog row,
its thumbnail, and the transcript that had been made of it. The database was vacuumed
afterwards, so the deleted rows are not recoverable from free pages in the file.

The people named in the catalog and visible in the photographs are of Rachel's
generation. The note on one photograph — about who survived — is the family's own
wording, published at their request.

## Using it

Download this folder, then in the Studio choose **Storage → This device** and pick it.
That is all: the catalog sits beside the materials, which is how the Studio works
natively, so there is no import step.

```bash
git clone --depth 1 https://github.com/memor1al-project/Zikaron-Basalon-Studio.git
# then connect  Zikaron-Basalon-Studio/examples/helfgot-open  as the story folder
```

Anything you change is written back into your copy of the SQLite file. You cannot affect
the family's catalog, and you cannot affect this one except in your own clone.

## Licence

The code in this repository is Apache 2.0. **These materials are not.** The diary, the
photographs and the catalog belong to the Helfgott family and are published here by their
permission, for understanding and demonstrating the Studio. Do not redistribute them
separately or use them for anything else without asking.
