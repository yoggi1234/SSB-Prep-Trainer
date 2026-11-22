# SSB Prep Trainer: Important Topics Database

This branch holds only study notes, not app code. The app's **Important Topics**
screen (Windows and Android) reads `index.json` from here and downloads a PDF
only when you tap it, so the app itself stays small.

- `topics/`: one PDF per topic (lecturette plus GD notes, about 4-6 pages each)
- `index.json`: the list the app reads: id, title, category, SSB remarks
  number, pages, size, SHA-256 and date for every topic. GD-guide topics that
  share another topic's PDF carry `"see": "<id>"`.

To add or update a topic, replace or add its PDF in `topics/`, regenerate
`index.json` with the notes toolkit (`topics_db.py`), commit and push. Phones
and PCs pick up the change the next time the list is refreshed; a changed
PDF shows as "Update" because its SHA-256 no longer matches the copy on the
device.

These notes are study material checked against the sources listed inside each
PDF, as of the date printed on it. Facts change: check before quoting.
