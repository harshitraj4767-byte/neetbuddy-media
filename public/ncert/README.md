# NCERT E-Book assets

Chapter images used by the Highlighted NCERT reader live here.

Path convention:

    public/ncert/<subject>/images/<Chapter_Name>-image<N>.png

Rules:
- `<subject>` is lowercase: `biology`, `chemistry`, `physics`
- `<Chapter_Name>` is the chapter name with spaces replaced by underscores,
  `:` and `,` removed and `&` written as `and`
- `<N>` is the 1-based image number inside that chapter

Example:

    public/ncert/biology/images/Anatomy_of_Flowering_Plants-image13.png

which is served at:

    /ncert/biology/images/Anatomy_of_Flowering_Plants-image13.png

Just drop the PNG/JPG files into the right folder — the reader picks them up
automatically in chapter order, and shows a placeholder for missing images.
