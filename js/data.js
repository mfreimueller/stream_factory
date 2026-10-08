// Source data: a small excerpt in the spirit of the movie archive from the lecture project.
// Card #4 and #7 are the exact same record on purpose (so that distinct() has something to do).
(function (root) {
  const SF = (root.SF = root.SF || {});

  SF.MOVIES = [
    { title: 'Solar Drift',     year: 2014, genre: 'Sci-Fi',   rating: 8.2 },
    { title: 'The Last Harbor', year: 1998, genre: 'Drama',    rating: 7.4 },
    { title: 'Neon Alley',      year: 2021, genre: 'Thriller', rating: 6.8 },
    { title: 'The Dark Echo',   year: 2009, genre: 'Thriller', rating: 8.0 },
    { title: 'Quiet Summer',    year: 1975, genre: 'Drama',    rating: 5.9 },
    { title: 'Star Nomads',     year: 2016, genre: 'Sci-Fi',   rating: 7.1 },
    { title: 'The Dark Echo',   year: 2009, genre: 'Thriller', rating: 8.0 },
    { title: 'Paper Kingdom',   year: 2003, genre: 'Fantasy',  rating: 6.4 },
    { title: 'Iron Coast',      year: 1989, genre: 'Action',   rating: 6.0 },
    { title: 'Orbit Zero',      year: 2022, genre: 'Sci-Fi',   rating: 8.9 },
    { title: 'Laugh Track',     year: 2011, genre: 'Comedy',   rating: 5.2 },
    { title: 'Glass Summit',    year: 2019, genre: 'Action',   rating: 7.7 },
  ];

  SF.GENRE_COLORS = {
    'Sci-Fi': '#2563eb', Drama: '#9333ea', Thriller: '#dc2626',
    Fantasy: '#059669', Action: '#ea580c', Comedy: '#ca8a04',
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
