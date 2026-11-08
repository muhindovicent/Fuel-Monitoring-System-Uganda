# Administrator media management

Branch: `ui/map-first-command-center`.

## Deployment and persistent storage

Run the additive `007_media_management.sql` migration with the existing owner migration command **before deploying the new API**. Historical migrations are unchanged. It adds publication state/captions/attribution to the existing gallery/video tables and creates `media_assets` for binary files. Existing images and videos retain their published state; existing news and user records are preserved.

**Storage is PostgreSQL / Neon `bytea`, not the Render application filesystem.** No upload directory, Render persistent disk, S3 bucket, Cloudinary account, new dependency or external storage credentials are required. The existing environment variables remain the configuration:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | API runtime connection to the persistent PostgreSQL/Neon database |
| `MIGRATION_DATABASE_URL` | Schema-owner connection for the one-off migration job; keep it out of the API service |
| `PGSSLMODE=verify-full` | Certificate-verified TLS for remote PostgreSQL/Neon |
| `APP_ORIGIN` | Exact HTTPS application origin used by the existing session/CSRF protection |

The `mafuta_app` grant is included in the migration. Apply `deploy/runtime-grants.sql` after migrating when using a differently named runtime role. Database backups/PITR now contain uploaded editorial images and videos as well as the existing private evidence. Include a published image/video download in restore checks. PostgreSQL storage growth includes these files.

Uploads are bounded to **10 MiB per image** and **25 MiB per video**, with 40 upload attempts per administrator per hour. Supported images: JPEG, PNG, WebP. Supported video containers: MP4, WebM; browser playback also depends on the file's codec. The form previews local files before upload and reports preview, network, validation and storage errors. A 100% transfer indicator means transfer has completed; confirmation is shown only after the database upload and metadata save succeed. Database errors do not simulate successful uploads.

## Administrator workflow

1. Sign in as an administrator and open **Media management**.
2. Select **Upload Image**, **Add Video**, or **Publish News**.
3. Select the image/video directly from the device. Videos also accept YouTube, Vimeo and HTTPS MP4/WebM links. Thumbnail and news featured-image files can be selected independently. Existing approved static `/assets/` images and HTTPS image URLs remain usable.
4. Enter the metadata and attribution. Images require photographer, source/owner and license. Videos require source/owner and license. News requires source name and an HTTPS source URL. The news editor supports headline, full plain-text article, optional summary, category, featured image and publication date/time in the administrator's local time; the API stores UTC.
5. Check the image/video preview. Use **Save metadata** / **Save draft** to keep new content private, or **Publish** to publish. **Save changes** retains the current status when editing. A published news item with a future publication date is scheduled and stays out of public results until that time.
6. Use **Edit**, **Publish**, **Unpublish**, or **Delete** on any displayed record. Unpublish retains the metadata and file as a private draft. Delete removes the content and unused uploaded files; a file still referenced by another content record is retained.

The public photo carousel/gallery, homepage newsroom/video sections, newsroom and video centre query only published content. Cards include source attribution, image captions, full news text, and a native video player or normalized provider embed. Open tabs in the same browser receive a publish/edit/delete notification. Visible public views also refresh their content every 60 seconds and when returning to the tab, without rebuilding the station explorer or resetting its filters. Scheduled news becomes eligible automatically at its publication time.

## File access and lifecycle

- Uploads and all metadata writes require the existing administrator session, origin checks and CSRF token. Inspector, analyst, operator and citizen accounts cannot upload or manage content.
- The API checks actual file signatures against the declared MIME type and applies size limits before persistence. SVG, HTML, arbitrary attachments and unsupported containers are rejected. Files are served with the stored type, `nosniff`, no-store caching and authorization on each request.
- An uploaded file is initially private. Administrators may preview it; anonymous users receive 404 unless a currently public content record references it. Unpublishing revokes future public requests unless another published record uses the same file.
- Uploaded videos support HTTP byte ranges, including 206 playback/seek responses and 416 for invalid ranges.
- Media URLs must be saved asset paths, approved public static images, or HTTPS without embedded credentials. Video frames are limited to normalized YouTube privacy-enhanced and Vimeo players. Arbitrary embed URLs and unsafe protocols are rejected. Article content is rendered as text, not executable HTML.
- Replacing/deleting content cleans up files no longer referenced by image, video or featured-image metadata. Cancelling an editor attempts to remove any newly uploaded but unsaved files. `DELETE /admin/media-assets/:id` lets an administrator explicitly remove an unreferenced upload, and returns 409 for a referenced file. Interrupted uploads that committed before a browser disconnect can leave private orphan rows; review these before any maintenance deletion. There is no automatic deletion of user or investigation records.

## API additions and compatibility

Existing `/media`, `/videos`, `/news` create/update/delete routes remain in use. Public GETs always filter published state (even for an administrator). `/admin/media` lists drafts, archived and published metadata for management. Existing API creation defaults remain published for compatibility; the new editor explicitly sends `draft` for Save metadata.

`POST /admin/media-assets` accepts a raw supported file body with its MIME `Content-Type`; the confirmed result is `{id,url,mediaType,size}`. Use the returned URL as `imageUrl`, `videoUrl` or `thumbnailUrl` in the existing metadata APIs. The file response is `/media-assets/:id`. News accepts `publicationDate` (ISO 8601 with timezone), and images accept `caption`. Images/videos accept `status: draft|published|archived`. All updates/deletions and upload confirmations are audited.

## Verification

- API regressions cover RBAC/CSRF, size/type validation, private drafts, publication/unpublication, exact stored bytes after recreating the HTTP application, runtime-role grants, shared-file preservation, replacement/deletion cleanup, byte ranges, scheduled news, attribution, supported links and unsafe URL rejection.
- Real-browser workflows at **360px and 1440px** select device PNGs and a real WebM recorded with the browser's MediaRecorder, preview them, upload, save metadata, publish, confirm public rendering/playback and live updates, edit, unpublish and delete. Separate checks cover failed uploads with retained entries and provider-link preview/publishing.
- Run `npm run check` and `npm run test:e2e` for the full unit/API and browser suites. Browser fixtures use isolated embedded test databases and never the deployment database.
