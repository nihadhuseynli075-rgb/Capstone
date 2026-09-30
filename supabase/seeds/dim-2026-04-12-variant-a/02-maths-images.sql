-- Attach the maths pictures. Run after 01-maths-questions.sql, and only once the
-- files are uploaded: Supabase -> Storage -> question-images -> new folder
-- "dim-2026-04-12-variant-a" -> upload everything in this folder's images/ as it is named.

update questions set image_url = 'https://gqoruxwavawwzyhqesrk.supabase.co/storage/v1/object/public/question-images/dim-2026-04-12-variant-a/q72.png'
  where source = 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q72';
update questions set image_url = 'https://gqoruxwavawwzyhqesrk.supabase.co/storage/v1/object/public/question-images/dim-2026-04-12-variant-a/q77.png'
  where source = 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q77';
update questions set image_url = 'https://gqoruxwavawwzyhqesrk.supabase.co/storage/v1/object/public/question-images/dim-2026-04-12-variant-a/q78.png'
  where source = 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q78';
update questions set image_url = 'https://gqoruxwavawwzyhqesrk.supabase.co/storage/v1/object/public/question-images/dim-2026-04-12-variant-a/q79.png'
  where source = 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q79';
update questions set image_url = 'https://gqoruxwavawwzyhqesrk.supabase.co/storage/v1/object/public/question-images/dim-2026-04-12-variant-a/q81.png'
  where source = 'DİM Grade 9, Russian sector, Variant A, 12 April 2026, Q81';

select source, image_url from questions where image_url like '%/dim-2026-04-12-variant-a/%' order by source;
