// Keep database-backed media bounded. The existing 5 GB Railway volume was
// checked before configuring 2 GB for October production. Bad values fail
// closed to the original 1 GB cap rather than removing the storage limit.
export function mediaLibraryLimit(value=process.env.MEDIA_STORAGE_LIMIT_MB) {
  const mb=Number(value);
  return (Number.isInteger(mb)&&mb>=1024&&mb<=2048?mb:1024)*1024*1024;
}
