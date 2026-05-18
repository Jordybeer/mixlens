-- Add audio_storage_path column to analyses table
alter table analyses add column if not exists audio_storage_path text;

-- Create storage bucket for audio files (run once)
insert into storage.buckets (id, name, public)
values ('audio-files', 'audio-files', false)
on conflict (id) do nothing;

-- RLS: users can only upload/read/delete their own files
create policy "Users can upload own audio"
  on storage.objects for insert
  with check (
    bucket_id = 'audio-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can read own audio"
  on storage.objects for select
  using (
    bucket_id = 'audio-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own audio"
  on storage.objects for delete
  using (
    bucket_id = 'audio-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
