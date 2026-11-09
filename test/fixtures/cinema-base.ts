/** The cinema configuration from the reported rendering failure. Keep its mixed-case keys. */
export const CINEMA_BASE = `properties:
  file.name:
    displayName: Movie name
  note.genre:
    displayName: genre
views:
  - type: table
    name: Table
    filters:
      and:
        - file.folder == "Rating/kino"
        - and:
            - watched > "2025-12-31"
            - watched < "2027-01-01"
    order:
      - file.name
      - rating
      - Year
      - genre
      - Watched
    sort:
      - property: Watched
        direction: DESC
      - property: rating
        direction: DESC
      - property: Rating
        direction: DESC
      - property: Genre
        direction: ASC
    columnSize:
      file.name: 305
      note.rating: 114
      note.Year: 81
      note.Watched: 142
      note.genre: 152
  - type: table
    name: Sort by rating
    filters:
      and:
        - file.folder == "Rating/kino"
        - and:
            - watched > "2024-12-31"
            - watched < "2026-01-01"
    order:
      - file.name
      - rating
      - genre
      - Watched
    sort:
      - property: Watched
        direction: DESC
      - property: rating
        direction: DESC
      - property: favorite tracks
        direction: ASC
      - property: file.name
        direction: DESC
      - property: genre
        direction: DESC
    columnSize:
      file.name: 197
      note.rating: 81
      note.genre: 254
      note.Watched: 142
`;
export const CINEMA_TEXT = '\n#### Cinema base\n```base\n' + CINEMA_BASE + '\n```\n';
