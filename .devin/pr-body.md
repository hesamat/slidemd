## Summary

- On the first drag move, a markdown image is converted to `position: relative` + `.img-positioned`, which changes the surrounding flex/block layout and makes the picture jump.
- Capture the image's bounding rect at drag start and, after the conversion, add a corrective `left`/`top` offset so the image stays visually in place and only moves by the pointer delta.
- Added a unit test verifying the correction counteracts a simulated 50px layout shift.

## Manual Verification

- [ ] Open a deck in edit mode with a markdown image (e.g. `![alt](images/foo.jpeg)`) in a centered layout such as `focus`.
- [ ] Click and drag the image slightly — it should stay under the cursor on the first move instead of jumping down/right.
- [ ] Drag an image that is already positioned (e.g. previously dragged/resized) — no regression; movement should be smooth.
- [ ] Drag an image across areas — drop and reselection still work.
