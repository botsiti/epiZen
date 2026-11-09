// Representative MOCs from the supplied screenshots, without personal note contents.
export const MUSIC_BASE = `properties:
  file.name:
    displayName: Album name
views:
  - type: table
    name: Listened order
    filters:
      and:
        - file.folder == "Rating/music"
        - and:
            - listened > "2024-12-31"
            - listened < "2026-01-01"
    order:
      - file.name
      - Artist
      - rating
      - genre
      - Year
      - listened
      - favorite tracks
    sort:
      - property: listened
        direction: DESC
      - property: rating
        direction: DESC
    columnSize:
      file.name: 499
  - type: table
    name: Sort by rating
    filters:
      and:
        - file.folder == "Rating/music"
        - listened >= "2025-01-01"
        - listened < "2026-01-01"
    order: [file.name, Artist, rating, genre]
    sort:
      - property: rating
        direction: DESC
`;
export const MUSIC_DATAVIEW = `table artist, rating, year, genre, listened, favorite-tracks
from "Rating/music"
where dateformat(listened, "yyyy") = "2024"
and !contains(file.name, "00")
sort listened desc`;
export const GENRE_DATAVIEW = `table artist, rating, year, genre, file.ctime as "Created"
from "Rating/music"
where contains(genre, "post-punk")
sort rating desc`;
