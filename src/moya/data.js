// Moya, the mind reader: everything Moya knows. Pure data, no DOM, so Node tests can load it.
//
// Each character has a tag string. A tag is a fact Moya is sure of:
//   tag    yes                 tag+  mostly / usually (0.75)     tag~  partly / sometimes (0.5)
//   tag-   a little (0.25)     !tag  definitely not (0)          tag?  unknown: Moya ignores this question for them
//   by1987 born in 1987        dead  no longer alive            c:za  from South Africa (c:us~ = partly from the USA)
//   r:africa  from that region even without a country code (Wakanda, the Pride Lands)
// A question a character has no tag for falls back to the question's default (usually "no"; for things Moya cannot
// know about real people, such as glasses or a beard, the default is "unknown"). Facts checked on 26 November 2026,
// including the 2026 World Cup (Spain), the 2026 Ballon d'Or (Harry Kane) and Salah leaving Liverpool (2026).

// ---- the six answers ----
export const ANSWERS = [
  { id: 'yes', label: 'Yes', v: 1, btn: 'A', key: '1' },
  { id: 'no', label: 'No', v: 0, btn: 'B', key: '2' },
  { id: 'probably', label: 'Probably', v: 0.75, btn: 'Y', key: '3' },
  { id: 'maybe', label: 'Maybe', v: 0.5, btn: 'R1', key: '4' },
  { id: 'probnot', label: 'Probably not', v: 0.25, btn: 'X', key: '5' },
  { id: 'idk', label: "I don't know", v: null, btn: 'L1', key: '6' },
];

// ---- questions ----
// kind: 'both' asks about anyone; 'real' only means something for real people (made-up characters skip it);
// 'fic' only for made-up characters. rd: value for a real person with no tag (0 = no, null = unknown).
const Q = (id, text, kind = 'both', rd = 0) => ({ id, text, kind, rd });
export const QUESTIONS = [
  // who and what
  Q('real', 'Is your character a real person?'),
  Q('m', 'Is your character male?'),
  Q('f', 'Is your character female?'),
  Q('alive', 'Is your character still alive?', 'real'),
  Q('b2000', 'Was your character born in the year 2000 or later?', 'real'),
  Q('b1950', 'Was your character born before 1950?', 'real'),
  Q('b1900', 'Was your character born before 1900?', 'real'),
  Q('human', 'Is your character a human?'),
  Q('animal', 'Is your character an animal?'),
  Q('kid', 'Is your character a child or a teenager?', 'fic'),
  Q('talk', 'Can your character talk?'),
  // where from
  Q('africa', 'Is your character from Africa?'),
  Q('za', 'Is your character from South Africa?'),
  Q('egypt', 'Is your character from Egypt?'),
  Q('nigeria', 'Is your character from Nigeria?'),
  Q('europe', 'Is your character from Europe?'),
  Q('uk', 'Is your character from the UK (England, Scotland, Wales or Northern Ireland)?'),
  Q('france', 'Is your character from France?'),
  Q('spain', 'Is your character from Spain?'),
  Q('portugal', 'Is your character from Portugal?'),
  Q('netherlands', 'Is your character from the Netherlands?'),
  Q('us', 'Is your character from the USA?'),
  Q('canada', 'Is your character from Canada?'),
  Q('latam', 'Is your character from Latin America (like Brazil, Argentina or Mexico)?'),
  Q('brazil', 'Is your character from Brazil?'),
  Q('argentina', 'Is your character from Argentina?'),
  Q('caribbean', 'Is your character from the Caribbean (like Jamaica)?'),
  Q('asia', 'Is your character from Asia?'),
  Q('japan', 'Is your character from Japan, or was it created in Japan?'),
  // sport
  Q('sport', 'Is your character known for sport?'),
  Q('football', 'Is your character a footballer (soccer player)?'),
  Q('fw', 'Does your character play as a forward or striker?'),
  Q('mid', 'Is your character a midfielder?'),
  Q('def', 'Is your character a defender?'),
  Q('gk', 'Is your character a goalkeeper?'),
  Q('coach', 'Is your character a football coach or manager?'),
  Q('lefty', 'Is your character left-footed (or a left-handed player)?', 'real', null),
  Q('retired', 'Has your character retired from playing sport?', 'real', null),
  Q('prem', 'Has your character played or coached in the English Premier League?'),
  Q('chelsea', 'Has your character played for (or managed) Chelsea?'),
  Q('mancity', 'Has your character played for (or managed) Manchester City?'),
  Q('manutd', 'Has your character played for (or managed) Manchester United?'),
  Q('liverpool', 'Has your character played for (or managed) Liverpool?'),
  Q('arsenal', 'Has your character played for (or managed) Arsenal?'),
  Q('realmadrid', 'Has your character played for (or managed) Real Madrid?'),
  Q('barcelona', 'Has your character played for (or managed) Barcelona?'),
  Q('psg', 'Has your character played for Paris Saint-Germain (PSG)?'),
  Q('bayern', 'Has your character played for (or managed) Bayern Munich?'),
  Q('juventus', 'Has your character played for (or managed) Juventus?'),
  Q('saudi', 'Has your character played for a club in Saudi Arabia?'),
  Q('mls', "Has your character played in America's MLS league?"),
  Q('worldcup', 'Has your character won the FIFA World Cup?'),
  Q('ballondor', "Has your character won the Ballon d'Or?"),
  Q('olympic', 'Has your character won an Olympic gold medal?'),
  Q('rugby', 'Does your character play rugby?'),
  Q('cricket', 'Does your character play cricket?'),
  Q('tennis', 'Does your character play tennis?'),
  Q('athletics', 'Is your character a runner (athletics)?'),
  Q('basketball', 'Does your character play basketball?'),
  Q('motor', 'Is your character a racing driver or a racing car?'),
  Q('fighting', 'Is your character a boxer or a wrestler?'),
  Q('swimming', 'Is your character a swimmer?'),
  Q('gymnastics', 'Is your character a gymnast?'),
  Q('fast', 'Is your character famous for being super fast?', 'both', null),
  // music, screen and the internet
  Q('musician', 'Is your character a musician?', 'real'),
  Q('sing', 'Is your character famous for singing?'),
  Q('rap', 'Does your character rap?', 'real'),
  Q('dj', 'Is your character a DJ or music producer?', 'real'),
  Q('amapiano', 'Is your character known for amapiano music?', 'real'),
  Q('grammy', 'Has your character won a Grammy award?', 'real'),
  Q('actor', 'Is your character a famous actor or actress?', 'real'),
  Q('oscar', 'Has your character won an Oscar?', 'real'),
  Q('comedian', 'Is your character a comedian?', 'real'),
  Q('youtube', 'Is your character famous on YouTube or for live streaming?'),
  // leaders, history, science, money
  Q('politics', "Is your character a politician or a country's leader?", 'real'),
  Q('president', 'Has your character been the president of a country?', 'real'),
  Q('royal', 'Is your character a king, queen, prince or princess?'),
  Q('military', 'Is your character a soldier or a warrior?'),
  Q('activist', 'Is your character famous for fighting for freedom or equal rights?', 'real'),
  Q('nobel', 'Has your character won a Nobel Prize?', 'real'),
  Q('science', 'Is your character a scientist or an inventor?'),
  Q('space', 'Has your character been to outer space?'),
  Q('writer', 'Is your character a writer?', 'real'),
  Q('painter', 'Is your character a painter or an artist?', 'real'),
  Q('business', 'Is your character a businessperson or the boss of a company?'),
  Q('tech', 'Is your character linked to computers, the internet or tech companies?', 'real'),
  Q('rich', 'Is your character a billionaire?', 'both', null),
  // made-up characters: where they come from
  Q('cartoon', 'Is your character from a cartoon, anime or animated film?', 'fic'),
  Q('videogame', 'Is your character from a video game?', 'fic'),
  Q('anime', 'Is your character from Japanese anime or manga?', 'fic'),
  Q('comic', 'Did your character first appear in a comic book or comic strip?', 'fic'),
  Q('book', 'Did your character first appear in a book?', 'fic'),
  Q('liveaction', 'Has your character appeared in films or TV shows with real actors?', 'fic'),
  Q('toy', 'Is your character a toy, or did it start as a toy?', 'fic'),
  Q('superhero', 'Is your character a superhero?', 'fic'),
  Q('villain', 'Is your character a villain (a baddie)?', 'fic'),
  Q('marvel', 'Is your character from Marvel?', 'fic'),
  Q('dc', 'Is your character from DC Comics?', 'fic'),
  Q('disney', 'Is your character from a Disney or Pixar animated film?', 'fic'),
  Q('starwars', 'Is your character from Star Wars?', 'fic'),
  Q('harrypotter', 'Is your character from Harry Potter?', 'fic'),
  Q('pokemon', 'Is your character from Pokémon?', 'fic'),
  Q('mario', 'Is your character from the Super Mario games?', 'fic'),
  Q('sonic', 'Is your character from the Sonic the Hedgehog games?', 'fic'),
  Q('spongebob', 'Is your character from SpongeBob SquarePants?', 'fic'),
  Q('gumball', 'Is your character from The Amazing World of Gumball?', 'fic'),
  Q('simpsons', 'Is your character from The Simpsons?', 'fic'),
  Q('minecraft', 'Is your character from Minecraft?', 'fic'),
  // what kind of being
  Q('robot', 'Is your character a robot or a machine?'),
  Q('alien', 'Is your character an alien?'),
  Q('monster', 'Is your character a monster or a creature?'),
  Q('object', 'Is your character an object or a vehicle?'),
  Q('cat', 'Is your character a cat (or a big cat like a lion)?'),
  Q('dog', 'Is your character a dog?'),
  Q('mouse', 'Is your character a mouse or a rat?'),
  Q('bear', 'Is your character a bear?'),
  Q('pig', 'Is your character a pig?'),
  Q('rabbit', 'Is your character a rabbit?'),
  Q('bird', 'Is your character a bird?'),
  Q('fish', 'Is your character a fish or another sea creature?'),
  Q('reptile', 'Is your character a dinosaur, a dragon or a reptile?'),
  // looks
  Q('blue', 'Is your character mostly blue?', 'fic'),
  Q('yellow', 'Is your character mostly yellow?', 'fic'),
  Q('red', 'Is your character mostly red?', 'fic'),
  Q('green', 'Is your character mostly green?', 'fic'),
  Q('pink', 'Is your character mostly pink?', 'fic'),
  Q('orange', 'Is your character mostly orange?', 'fic'),
  Q('black', 'Is your character mostly black?', 'fic'),
  Q('white', 'Is your character mostly white?', 'fic'),
  Q('purple', 'Is your character mostly purple?', 'fic'),
  Q('brown', 'Is your character mostly brown?', 'fic'),
  Q('hat', 'Does your character usually wear a hat or a cap?', 'both', null),
  Q('glasses', 'Does your character wear glasses or goggles?', 'both', null),
  Q('beard', 'Does your character have a beard or a moustache?', 'both', null),
  Q('bald', 'Is your character bald?', 'both', null),
  Q('mask', 'Does your character wear a mask or a helmet over the face?', 'fic'),
  Q('cape', 'Does your character wear a cape?', 'fic'),
  Q('sword', 'Does your character fight with a sword or a lightsaber?', 'fic'),
  Q('tail', 'Does your character have a tail?', 'fic'),
  Q('spiky', 'Does your character have spiky hair or spikes?', 'fic'),
  // abilities and life
  Q('fly', 'Can your character fly?', 'fic'),
  Q('powers', 'Does your character have superpowers or special powers?', 'fic'),
  Q('magic', 'Can your character do magic?', 'fic'),
  Q('water', 'Does your character live in or near the sea?', 'fic'),
  Q('food', 'Is your character famous for loving food?', 'both', null),
  Q('sidekick', 'Is your character the sidekick or best friend of the main hero?', 'fic'),
];

// ---- where countries are ----
export const COUNTRY = {
  za: { africa: 1, za: 1 }, eg: { africa: 1, egypt: 1 }, ng: { africa: 1, nigeria: 1 }, sn: { africa: 1 }, ci: { africa: 1 }, sz: { africa: 1 },
  us: { us: 1 }, ca: { canada: 1 },
  br: { latam: 1, brazil: 1 }, ar: { latam: 1, argentina: 1 }, co: { latam: 1 }, ec: { latam: 1 }, pe: { latam: 1 }, mx: { latam: 1 },
  jm: { caribbean: 1 }, bb: { caribbean: 1 },
  uk: { europe: 1, uk: 1 }, fr: { europe: 1, france: 1 }, es: { europe: 1, spain: 1 }, pt: { europe: 1, portugal: 1 }, nl: { europe: 1, netherlands: 1 },
  de: { europe: 1 }, be: { europe: 1 }, no: { europe: 1 }, hr: { europe: 1 }, se: { europe: 1 }, pl: { europe: 1 }, it: { europe: 1 },
  ch: { europe: 1 }, rs: { europe: 1 }, fi: { europe: 1 }, ro: { europe: 1 }, gr: { europe: 1 },
  ru: { europe: 0.75, asia: 0.5 }, ge: { europe: 0.5, asia: 0.5 },
  jp: { asia: 1, japan: 1 }, kr: { asia: 1 }, in: { asia: 1 }, pk: { asia: 1 }, cn: { asia: 1 }, au: {},
};
export const REGIONS = ['africa', 'za', 'egypt', 'nigeria', 'europe', 'uk', 'france', 'spain', 'portugal', 'netherlands', 'us', 'canada', 'latam', 'brazil', 'argentina', 'caribbean', 'asia', 'japan'];

// ---- categories: the little badge on Moya's guess card ----
export const CATEGORY = {
  football: { icon: '⚽', label: 'Football' }, sport: { icon: '🏅', label: 'Sport' }, music: { icon: '🎤', label: 'Music' },
  screen: { icon: '🎬', label: 'Film & TV' }, online: { icon: '▶️', label: 'Online' }, history: { icon: '📜', label: 'History' },
  leader: { icon: '🏛️', label: 'Leader' }, science: { icon: '🔭', label: 'Science' }, business: { icon: '💼', label: 'Business' },
  cartoon: { icon: '🎨', label: 'Cartoon' }, anime: { icon: '🌸', label: 'Anime' }, game: { icon: '🎮', label: 'Video game' },
  hero: { icon: '🦸', label: 'Comics' }, movie: { icon: '🍿', label: 'Movies' }, book: { icon: '📖', label: 'Books' },
  toy: { icon: '🧸', label: 'Toys' }, tv: { icon: '📺', label: 'TV' }, taught: { icon: '✨', label: 'You taught me' },
};

const P = (id, name, desc, cat, pop, tags) => ({ id, name, desc, cat, pop, tags: 'real ' + tags });
const F = (id, name, desc, cat, pop, tags) => ({ id, name, desc, cat, pop, tags });

// ---- real people ----
// pop 3 = superstar (asked about most often), 2 = very famous, 1 = famous.
const PEOPLE = [
  // football
  P('messi', 'Lionel Messi', 'Argentine forward, 2022 World Cup winner', 'football', 3, 'm by1987 c:ar football fw barcelona psg mls worldcup ballondor olympic lefty beard+ !retired'),
  P('ronaldo', 'Cristiano Ronaldo', "Portuguese forward, five-time Ballon d'Or winner", 'football', 3, 'm by1985 c:pt football fw manutd realmadrid juventus saudi prem ballondor rich+ !lefty !beard !retired'),
  P('neymar', 'Neymar Jr', 'Brazilian forward, Santos, Barcelona and PSG', 'football', 2, 'm by1992 c:br football fw barcelona psg saudi olympic !lefty !retired'),
  P('mbappe', 'Kylian Mbappé', 'French forward, 2018 World Cup winner', 'football', 3, 'm by1998 c:fr football fw psg realmadrid worldcup fast+ !lefty !beard !retired'),
  P('haaland', 'Erling Haaland', 'Norwegian striker at Manchester City', 'football', 3, 'm by2000 c:no football fw mancity prem lefty !beard !retired'),
  P('salah', 'Mohamed Salah', 'Egyptian forward, Liverpool legend (2017–2026)', 'football', 3, 'm by1992 c:eg football fw chelsea liverpool prem lefty beard !retired'),
  P('palmer', 'Cole Palmer', 'English attacking midfielder, Man City then Chelsea', 'football', 3, 'm by2002 c:uk football mid+ fw~ mancity chelsea prem lefty !retired'),
  P('saka', 'Bukayo Saka', 'English winger who came through Arsenal’s academy', 'football', 2, 'm by2001 c:uk football fw+ mid- arsenal prem lefty !retired'),
  P('bellingham', 'Jude Bellingham', 'English midfielder, Dortmund then Real Madrid', 'football', 2, 'm by2003 c:uk football mid realmadrid !lefty !retired'),
  P('vinicius', 'Vinícius Júnior', 'Brazilian winger at Real Madrid', 'football', 2, 'm by2000 c:br football fw realmadrid fast~ !lefty !retired'),
  P('yamal', 'Lamine Yamal', 'Spanish winger at Barcelona, 2026 World Cup winner', 'football', 3, 'm by2007 c:es football fw barcelona worldcup lefty !retired'),
  P('kane', 'Harry Kane', "English striker, 2026 Ballon d'Or winner", 'football', 2, 'm by1993 c:uk football fw prem bayern ballondor !lefty !retired'),
  P('debruyne', 'Kevin De Bruyne', 'Belgian midfielder, Manchester City great', 'football', 2, 'm by1991 c:be football mid chelsea mancity prem !lefty'),
  P('modric', 'Luka Modrić', "Croatian midfielder, 2018 Ballon d'Or winner", 'football', 2, 'm by1985 c:hr football mid prem realmadrid ballondor !lefty'),
  P('son', 'Son Heung-min', 'South Korean forward, Tottenham then LAFC', 'football', 2, 'm by1992 c:kr football fw prem mls lefty~'),
  P('vandijk', 'Virgil van Dijk', 'Dutch centre-back for Liverpool and the Netherlands', 'football', 2, 'm by1991 c:nl football def prem liverpool !lefty beard+'),
  P('rodri', 'Rodri', "Spanish midfielder, 2024 Ballon d'Or winner", 'football', 1, 'm by1996 c:es football mid mancity barcelona prem ballondor worldcup !lefty beard+ !retired'),
  P('caicedo', 'Moisés Caicedo', 'Ecuadorian midfielder, Brighton then Chelsea', 'football', 1, 'm by2001 c:ec football mid chelsea prem !lefty !retired'),
  P('enzo', 'Enzo Fernández', 'Argentine midfielder, 2022 World Cup winner', 'football', 1, 'm by2001 c:ar football mid chelsea mancity prem worldcup !lefty !retired'),
  P('reecejames', 'Reece James', 'English right-back from Chelsea’s academy', 'football', 1, 'm by1999 c:uk football def chelsea prem !lefty'),
  P('estevao', 'Estêvão', 'Brazilian winger, Palmeiras then Chelsea', 'football', 1, 'm by2007 c:br football fw chelsea prem lefty !retired'),
  P('bruno', 'Bruno Fernandes', 'Portuguese playmaker, Sporting then Man United', 'football', 1, 'm by1994 c:pt football mid manutd prem !lefty'),
  P('pele', 'Pelé', 'Brazilian legend, three-time World Cup winner', 'football', 2, 'm dead by1940 c:br football fw worldcup ballondor~ !lefty retired'),
  P('maradona', 'Diego Maradona', 'Argentine legend, 1986 World Cup winner', 'football', 2, 'm dead by1960 c:ar football fw+ mid~ barcelona worldcup ballondor~ lefty retired'),
  P('zidane', 'Zinedine Zidane', 'French playmaker and Real Madrid coach', 'football', 2, 'm by1972 c:fr football mid coach+ juventus realmadrid worldcup ballondor !lefty bald retired'),
  P('ronaldinho', 'Ronaldinho', "Brazilian magician, 2005 Ballon d'Or winner", 'football', 2, 'm by1980 c:br football fw+ mid~ psg barcelona worldcup ballondor !lefty retired'),
  P('beckham', 'David Beckham', 'English midfielder famous for free kicks', 'football', 2, 'm by1975 c:uk football mid manutd realmadrid psg mls prem business~ !lefty retired'),
  P('rooney', 'Wayne Rooney', 'England and Manchester United striker', 'football', 1, 'm by1985 c:uk football fw manutd prem mls coach~ !lefty retired'),
  P('drogba', 'Didier Drogba', 'Ivorian striker and Chelsea legend', 'football', 1, 'm by1978 c:ci football fw chelsea prem mls !lefty retired'),
  P('mane', 'Sadio Mané', 'Senegalese forward, ex-Liverpool and Bayern', 'football', 1, 'm by1992 c:sn football fw liverpool prem bayern saudi !lefty !retired'),
  P('henry', 'Thierry Henry', 'French striker and Arsenal legend', 'football', 1, 'm by1977 c:fr football fw juventus arsenal barcelona mls prem worldcup coach~ !lefty bald+ retired'),
  P('putellas', 'Alexia Putellas', "Spanish midfielder, three-time Ballon d'Or winner", 'football', 1, 'f by1994 c:es football mid barcelona ballondor worldcup !retired'),
  P('ronwen', 'Ronwen Williams', 'South African goalkeeper, Bafana Bafana', 'football', 1, 'm by1992 c:za football gk'),
  P('kgatlana', 'Thembi Kgatlana', 'South African forward, Banyana Banyana', 'football', 1, 'f by1996 c:za football fw'),
  P('tau', 'Percy Tau', 'South African forward, ex-Brighton', 'football', 1, 'm by1994 c:za football fw prem'),
  P('benni', 'Benni McCarthy', 'South African striker turned coach', 'football', 1, 'm by1977 c:za football fw coach+ prem manutd- retired'),
  P('radebe', 'Lucas Radebe', 'South African defender, Leeds United captain', 'football', 1, 'm by1969 c:za football def prem retired'),
  P('guardiola', 'Pep Guardiola', 'Spanish coach of Barcelona, Bayern and Man City', 'football', 1, 'm by1971 c:es coach football~ mid~ barcelona bayern mancity prem bald retired'),
  P('mourinho', 'José Mourinho', 'Portuguese coach, "The Special One"', 'football', 1, 'm by1963 c:pt coach chelsea realmadrid manutd prem'),
  // other sport
  P('bolt', 'Usain Bolt', 'Jamaican sprinter, fastest man ever timed', 'sport', 2, 'm by1986 c:jm athletics olympic fast retired'),
  P('vanniekerk', 'Wayde van Niekerk', 'South African 400 m Olympic champion (2016)', 'sport', 1, 'm by1992 c:za athletics olympic fast+'),
  P('semenya', 'Caster Semenya', 'South African 800 m Olympic champion', 'sport', 1, 'f by1991 c:za athletics olympic'),
  P('tatjana', 'Tatjana Smith', 'South African Olympic swimming champion', 'sport', 1, 'f by1997 c:za swimming olympic'),
  P('kolisi', 'Siya Kolisi', 'Springbok who captained two Rugby World Cup wins', 'sport', 2, 'm by1991 c:za rugby'),
  P('abdv', 'AB de Villiers', 'South African cricket star', 'sport', 1, 'm by1984 c:za cricket !lefty retired'),
  P('kohli', 'Virat Kohli', 'Indian cricket superstar', 'sport', 1, 'm by1988 c:in cricket !lefty beard'),
  P('serena', 'Serena Williams', 'American tennis champion', 'sport', 2, 'f by1981 c:us tennis olympic !lefty retired'),
  P('federer', 'Roger Federer', 'Swiss tennis legend', 'sport', 1, 'm by1981 c:ch tennis olympic !lefty retired'),
  P('nadal', 'Rafael Nadal', 'Spanish tennis legend, "King of Clay"', 'sport', 1, 'm by1986 c:es tennis olympic lefty retired'),
  P('djokovic', 'Novak Djokovic', 'Serbian tennis champion', 'sport', 1, 'm by1987 c:rs tennis olympic !lefty'),
  P('jordan', 'Michael Jordan', 'American basketball legend', 'sport', 2, 'm by1963 c:us basketball olympic bald rich business+ retired'),
  P('lebron', 'LeBron James', 'American basketball superstar', 'sport', 2, 'm by1984 c:us basketball olympic rich beard'),
  P('curry', 'Stephen Curry', 'American basketball sharpshooter', 'sport', 1, 'm by1988 c:us basketball olympic'),
  P('hamilton', 'Lewis Hamilton', 'British Formula 1 champion', 'sport', 2, 'm by1985 c:uk motor fast~'),
  P('verstappen', 'Max Verstappen', 'Dutch Formula 1 champion', 'sport', 1, 'm by1997 c:nl motor fast~ !retired'),
  P('ali', 'Muhammad Ali', 'American boxing legend', 'sport', 2, 'm dead by1942 c:us fighting olympic activist~ retired'),
  P('tyson', 'Mike Tyson', 'American heavyweight boxing champion', 'sport', 1, 'm by1966 c:us fighting retired~'),
  P('phelps', 'Michael Phelps', 'American swimmer with the most Olympic golds ever', 'sport', 1, 'm by1985 c:us swimming olympic retired'),
  P('biles', 'Simone Biles', 'American gymnastics superstar', 'sport', 1, 'f by1997 c:us gymnastics olympic'),
  // music
  P('tyla', 'Tyla', 'South African singer, two-time Grammy winner', 'music', 3, 'f by2002 c:za musician sing grammy amapiano+'),
  P('blackcoffee', 'Black Coffee', 'South African DJ and Grammy winner', 'music', 2, 'm by1976 c:za musician dj grammy'),
  P('kabza', 'Kabza De Small', 'South African amapiano producer and DJ', 'music', 1, 'm !b2000 !b1950 !b1900 c:za musician dj amapiano'),
  P('waffles', 'Uncle Waffles', 'Amapiano DJ from Eswatini', 'music', 1, 'f b2000? !b1950 !b1900 c:sz c:za~ musician dj amapiano'),
  P('masterkg', 'Master KG', 'South African producer of "Jerusalema"', 'music', 1, 'm !b2000 !b1950 !b1900 c:za musician dj'),
  P('nastyc', 'Nasty C', 'South African rapper from Durban', 'music', 1, 'm by1997 c:za musician rap'),
  P('cassper', 'Cassper Nyovest', 'South African rapper', 'music', 1, 'm by1990 c:za musician rap business~ fighting-'),
  P('burna', 'Burna Boy', 'Nigerian Afrobeats star', 'music', 1, 'm by1991 c:ng musician sing+ rap~ grammy'),
  P('wizkid', 'Wizkid', 'Nigerian Afrobeats star', 'music', 1, 'm by1990 c:ng musician sing grammy'),
  P('davido', 'Davido', 'Nigerian Afrobeats star, born in Atlanta', 'music', 1, 'm by1992 c:ng c:us- musician sing !grammy'),
  P('taylor', 'Taylor Swift', 'American pop superstar', 'music', 3, 'f by1989 c:us musician sing grammy rich actor- !oscar'),
  P('beyonce', 'Beyoncé', 'American singer with the most Grammy wins ever', 'music', 2, 'f by1981 c:us musician sing grammy actor~ !oscar'),
  P('drake', 'Drake', 'Canadian rapper and singer', 'music', 2, 'm by1986 c:ca musician rap sing+ grammy actor- !oscar beard+'),
  P('sheeran', 'Ed Sheeran', 'English singer-songwriter', 'music', 2, 'm by1991 c:uk musician sing grammy !oscar'),
  P('billie', 'Billie Eilish', 'American singer, Grammy and Oscar winner', 'music', 2, 'f by2001 c:us musician sing grammy oscar'),
  P('mj', 'Michael Jackson', 'The "King of Pop"', 'music', 2, 'm dead by1958 c:us musician sing grammy actor- !oscar'),
  P('bieber', 'Justin Bieber', 'Canadian pop singer, discovered on YouTube', 'music', 2, 'm by1994 c:ca musician sing grammy youtube~ !oscar'),
  P('rihanna', 'Rihanna', 'Barbadian singer and businesswoman', 'music', 2, 'f by1988 c:bb musician sing grammy business rich actor- !oscar'),
  P('ariana', 'Ariana Grande', 'American singer and actress', 'music', 1, 'f by1993 c:us musician sing grammy actor+'),
  P('weeknd', 'The Weeknd', 'Canadian singer', 'music', 1, 'm by1990 c:ca musician sing grammy'),
  P('kendrick', 'Kendrick Lamar', 'American rapper', 'music', 1, 'm by1987 c:us musician rap grammy'),
  P('eminem', 'Eminem', 'American rapper, Oscar winner for "Lose Yourself"', 'music', 1, 'm by1972 c:us musician rap grammy oscar actor-'),
  P('marley', 'Bob Marley', 'Jamaican reggae legend', 'music', 2, 'm dead by1945 c:jm musician sing grammy~ beard'),
  P('brunomars', 'Bruno Mars', 'American singer', 'music', 1, 'm by1985 c:us musician sing grammy'),
  P('adele', 'Adele', 'English singer', 'music', 1, 'f by1988 c:uk musician sing grammy oscar'),
  P('shakira', 'Shakira', 'Colombian singer of "Waka Waka"', 'music', 1, 'f by1977 c:co musician sing grammy'),
  // film, TV and comedy
  P('trevor', 'Trevor Noah', 'South African comedian, former Daily Show host', 'screen', 2, 'm by1984 c:za comedian actor- writer~'),
  P('charlize', 'Charlize Theron', 'South African-born, Oscar-winning actress', 'screen', 1, 'f by1975 c:za c:us~ actor oscar'),
  P('rock', 'Dwayne "The Rock" Johnson', 'American wrestler turned film star', 'screen', 2, 'm by1972 c:us actor fighting bald business~ !oscar'),
  P('willsmith', 'Will Smith', 'American actor and rapper', 'screen', 2, 'm by1968 c:us actor rap+ musician~ grammy oscar'),
  P('leo', 'Leonardo DiCaprio', 'American actor, star of Titanic', 'screen', 1, 'm by1974 c:us actor oscar'),
  P('kevinhart', 'Kevin Hart', 'American comedian and actor', 'screen', 1, 'm by1979 c:us comedian actor !oscar'),
  P('zendaya', 'Zendaya', 'American actress and singer', 'screen', 1, 'f by1996 c:us actor sing- musician- !oscar'),
  P('tomholland', 'Tom Holland', 'English actor who plays Spider-Man', 'screen', 1, 'm by1996 c:uk actor !oscar'),
  P('jackiechan', 'Jackie Chan', 'Hong Kong martial-arts film star', 'screen', 1, 'm by1954 c:cn actor oscar~'),
  P('reynolds', 'Ryan Reynolds', 'Canadian actor who plays Deadpool', 'screen', 1, 'm by1976 c:ca actor business~ !oscar'),
  // online
  P('mrbeast', 'MrBeast', 'American YouTuber famous for huge challenges', 'online', 3, 'm by1998 c:us youtube business beard+'),
  P('speed', 'IShowSpeed', 'American streamer and huge Ronaldo fan', 'online', 3, 'm by2005 c:us youtube musician-'),
  P('ksi', 'KSI', 'British YouTuber, boxer and rapper', 'online', 2, 'm by1993 c:uk youtube fighting musician rap business+'),
  P('pewdiepie', 'PewDiePie', 'Swedish YouTuber', 'online', 1, 'm by1989 c:se youtube'),
  P('kaicenat', 'Kai Cenat', 'American live streamer', 'online', 1, 'm by2001 c:us youtube'),
  // leaders and history
  P('mandela', 'Nelson Mandela', "South Africa's first democratically elected president", 'history', 3, 'm dead by1918 c:za politics president activist nobel writer~ royal- military- !beard'),
  P('tutu', 'Desmond Tutu', 'South African archbishop, Nobel Peace Prize winner', 'history', 1, 'm dead by1931 c:za activist nobel glasses'),
  P('shaka', 'Shaka Zulu', 'Founding king of the Zulu nation', 'history', 2, 'm dead by1787 c:za royal military'),
  P('ramaphosa', 'Cyril Ramaphosa', 'South African president (from 2018)', 'leader', 2, 'm by1952 c:za politics president business+'),
  P('obama', 'Barack Obama', '44th president of the USA', 'leader', 2, 'm by1961 c:us politics president nobel grammy writer+ !beard'),
  P('trump', 'Donald Trump', '45th and 47th president of the USA', 'leader', 2, 'm by1946 c:us politics president business rich !beard'),
  P('lincoln', 'Abraham Lincoln', '16th president of the USA', 'history', 1, 'm dead by1809 c:us politics president beard hat'),
  P('mlk', 'Martin Luther King Jr.', 'American civil rights leader', 'history', 2, 'm dead by1929 c:us activist nobel beard'),
  P('gandhi', 'Mahatma Gandhi', "Leader of India's independence movement", 'history', 2, 'm dead by1869 c:in c:za- activist politics~ glasses bald'),
  P('malala', 'Malala Yousafzai', 'Pakistani activist, youngest Nobel Prize winner', 'history', 1, 'f by1997 c:pk activist nobel writer~'),
  P('elizabeth', 'Queen Elizabeth II', 'British queen for 70 years', 'history', 2, 'f dead by1926 c:uk royal'),
  P('charles', 'King Charles III', 'King of the United Kingdom', 'leader', 1, 'm by1948 c:uk royal'),
  P('cleopatra', 'Cleopatra', 'Last queen of ancient Egypt', 'history', 2, 'f dead by-69 c:eg royal politics~'),
  P('caesar', 'Julius Caesar', 'Roman general and dictator', 'history', 1, 'm dead by-100 c:it military politics'),
  P('napoleon', 'Napoleon Bonaparte', 'French emperor and general', 'history', 2, 'm dead by1769 c:fr military politics royal+ hat'),
  P('shakespeare', 'William Shakespeare', 'English playwright', 'history', 2, 'm dead by1564 c:uk writer beard'),
  P('rowling', 'J.K. Rowling', 'British author of Harry Potter', 'history', 1, 'f by1965 c:uk writer'),
  P('davinci', 'Leonardo da Vinci', 'Italian painter of the Mona Lisa, and inventor', 'history', 2, 'm dead by1452 c:it painter science+ beard'),
  P('vangogh', 'Vincent van Gogh', 'Dutch painter of The Starry Night', 'history', 1, 'm dead by1853 c:nl painter beard'),
  // science, space and business
  P('einstein', 'Albert Einstein', 'Physicist famous for relativity', 'science', 3, 'm dead by1879 c:de c:us~ science nobel beard'),
  P('newton', 'Isaac Newton', 'English scientist who explained gravity', 'science', 2, 'm dead by1643 c:uk science !beard'),
  P('curie', 'Marie Curie', 'Polish-French scientist, two Nobel Prizes', 'science', 1, 'f dead by1867 c:pl c:fr+ science nobel'),
  P('darwin', 'Charles Darwin', 'English naturalist, theory of evolution', 'science', 1, 'm dead by1809 c:uk science writer~ beard'),
  P('edison', 'Thomas Edison', 'American inventor famous for the light bulb', 'science', 1, 'm dead by1847 c:us science business~'),
  P('armstrong', 'Neil Armstrong', 'First person to walk on the Moon', 'science', 2, 'm dead by1930 c:us space military-'),
  P('gagarin', 'Yuri Gagarin', 'First human in space', 'science', 1, 'm dead by1934 c:ru space military~'),
  P('shuttleworth', 'Mark Shuttleworth', 'First South African in space, founder of Ubuntu', 'science', 1, 'm by1973 c:za space tech business'),
  P('musk', 'Elon Musk', 'Pretoria-born boss of Tesla and SpaceX', 'business', 3, 'm by1971 c:za c:us+ c:ca- business tech rich science~ !space'),
  P('gates', 'Bill Gates', 'Co-founder of Microsoft', 'business', 2, 'm by1955 c:us business tech rich glasses'),
  P('jobs', 'Steve Jobs', 'Co-founder of Apple', 'business', 2, 'm dead by1955 c:us business tech glasses'),
  P('zuckerberg', 'Mark Zuckerberg', 'Founder of Facebook', 'business', 1, 'm by1984 c:us business tech rich'),
  P('bezos', 'Jeff Bezos', 'Founder of Amazon', 'business', 1, 'm by1964 c:us business tech rich space+ bald'),
  P('motsepe', 'Patrice Motsepe', 'South African billionaire, owner of Mamelodi Sundowns', 'business', 1, 'm by1962 c:za business rich'),
];

// ---- made-up characters ----
// For made-up characters "from" means where they live in their story; "created in Japan" has its own tag.
const FICTION = [
  // cartoons
  F('gumball', 'Gumball Watterson', 'Mischievous blue cat from Elmore', 'cartoon', 3, 'm c:us~ c:uk~ cartoon gumball animal cat blue kid tail?'),
  F('darwinw', 'Darwin Watterson', "Gumball's goldfish brother who grew legs", 'cartoon', 2, 'm c:us~ c:uk~ cartoon gumball animal fish orange kid sidekick tail+ water-'),
  F('anais', 'Anais Watterson', "Gumball's genius little sister", 'cartoon', 1, 'f c:us~ c:uk~ cartoon gumball animal rabbit pink kid tail?'),
  F('nicole', 'Nicole Watterson', "Gumball's tough, hard-working mum", 'cartoon', 1, 'f c:us~ c:uk~ cartoon gumball animal cat blue tail?'),
  F('richard', 'Richard Watterson', "Gumball's lazy, food-loving dad", 'cartoon', 1, 'm c:us~ c:uk~ cartoon gumball animal rabbit pink food tail?'),
  F('spongebob', 'SpongeBob SquarePants', 'Yellow sea sponge from Bikini Bottom', 'cartoon', 3, 'm c:us~ cartoon spongebob animal+ fish yellow water liveaction- sing-'),
  F('patrick', 'Patrick Star', "SpongeBob's starfish best friend", 'cartoon', 2, 'm c:us~ cartoon spongebob animal fish pink water sidekick liveaction-'),
  F('squidward', 'Squidward Tentacles', "SpongeBob's grumpy octopus neighbour", 'cartoon', 1, 'm c:us~ cartoon spongebob animal fish blue~ green~ water liveaction-'),
  F('krabs', 'Mr. Krabs', 'Money-loving crab who owns the Krusty Krab', 'cartoon', 1, 'm c:us~ cartoon spongebob animal fish red water business rich- liveaction-'),
  F('mickey', 'Mickey Mouse', "Disney's famous mouse", 'cartoon', 3, 'm c:us+ cartoon disney animal mouse black+ red- tail'),
  F('bugs', 'Bugs Bunny', 'Carrot-chewing rabbit: "What\'s up, Doc?"', 'cartoon', 2, 'm c:us~ cartoon animal rabbit food~ tail liveaction'),
  F('tom', 'Tom', 'The cat who chases Jerry', 'cartoon', 2, 'm c:us~ cartoon animal cat blue~ tail talk- liveaction'),
  F('jerry', 'Jerry', 'The clever mouse who outsmarts Tom', 'cartoon', 2, 'm c:us~ cartoon animal mouse brown tail talk- liveaction'),
  F('scooby', 'Scooby-Doo', 'Mystery-solving Great Dane', 'cartoon', 2, 'm c:us cartoon animal dog brown food tail talk~ liveaction+'),
  F('garfield', 'Garfield', 'Lazy, lasagne-loving cat', 'cartoon', 2, 'm c:us cartoon comic animal cat orange food tail talk+ liveaction+'),
  F('homer', 'Homer Simpson', 'Doughnut-loving dad from Springfield', 'cartoon', 2, 'm c:us cartoon simpsons human yellow food bald+'),
  F('bart', 'Bart Simpson', 'Mischievous boy from Springfield', 'cartoon', 2, 'm c:us cartoon simpsons human yellow kid spiky'),
  F('peppa', 'Peppa Pig', 'Little pig who loves jumping in muddy puddles', 'cartoon', 2, 'f c:uk cartoon animal pig pink kid tail'),
  F('bluey', 'Bluey', 'Playful Blue Heeler puppy from Brisbane', 'cartoon', 2, 'f c:au cartoon animal dog blue kid tail'),
  F('shrek', 'Shrek', 'Grumpy green ogre from the swamp', 'cartoon', 3, 'm cartoon book monster green'),
  F('donkey', 'Donkey', "Shrek's chatty best friend", 'cartoon', 1, 'm cartoon book? animal sidekick'),
  F('elsa', 'Elsa', 'Snow Queen of Arendelle with ice powers', 'cartoon', 3, 'f c:no~ cartoon disney human royal magic+ powers blue sing'),
  F('olaf', 'Olaf', 'Friendly snowman who loves warm hugs', 'cartoon', 2, 'm c:no~ cartoon disney white sidekick+ sing~'),
  F('simba', 'Simba', 'Lion prince, later king, of the Pride Lands', 'cartoon', 3, 'm r:africa cartoon disney animal cat+ royal orange~ yellow~ tail sing~'),
  F('scar', 'Scar', "Simba's wicked uncle", 'cartoon', 1, 'm r:africa cartoon disney animal cat+ villain royal~ brown~ black~ tail'),
  F('moana', 'Moana', 'Brave voyager who sails across the ocean', 'cartoon', 2, 'f cartoon disney human water sing+ kid royal~ liveaction?'),
  F('stitch', 'Stitch', 'Blue alien known as Experiment 626', 'cartoon', 3, 'm c:us~ cartoon disney alien monster~ blue space liveaction+'),
  F('ariel', 'Ariel', 'The Little Mermaid', 'cartoon', 2, 'f cartoon disney book~ human~ fish~ !animal royal water sing red~ liveaction+'),
  F('woody', 'Woody', 'Cowboy doll from Toy Story', 'cartoon', 2, 'm c:us~ cartoon disney toy human~ hat'),
  F('buzz', 'Buzz Lightyear', 'Space ranger toy from Toy Story', 'cartoon', 2, 'm c:us~ cartoon disney toy human~ white~ green~ purple- space~ fly-'),
  F('mcqueen', 'Lightning McQueen', 'Red race car from Cars', 'cartoon', 2, 'm c:us cartoon disney object motor red fast'),
  F('nemo', 'Nemo', 'Little clownfish lost in the ocean', 'cartoon', 2, 'm c:au cartoon disney animal fish orange water kid'),
  F('walle', 'WALL-E', 'Little trash-compacting robot', 'cartoon', 1, 'm cartoon disney robot space yellow~ brown~ talk- liveaction-'),
  F('baymax', 'Baymax', 'Inflatable healthcare robot from Big Hero 6', 'cartoon', 1, 'm cartoon disney comic~ robot white'),
  F('minion', 'A Minion', "One of Gru's yellow helpers", 'cartoon', 3, 'm cartoon yellow blue- glasses sidekick+ talk-'),
  F('gru', 'Gru', 'Former supervillain from Despicable Me', 'cartoon', 1, 'm cartoon human villain~ bald black~'),
  F('pooh', 'Winnie the Pooh', 'Honey-loving bear of the Hundred Acre Wood', 'cartoon', 2, 'm c:uk+ book cartoon disney animal bear toy+ yellow food liveaction~'),
  F('po', 'Po', 'Kung Fu Panda, the Dragon Warrior', 'cartoon', 2, 'm c:cn cartoon animal bear food black~ white~'),
  F('ben10', 'Ben Tennyson', 'Ben 10, who turns into aliens with the Omnitrix', 'cartoon', 2, 'm c:us cartoon human kid powers green~ liveaction~'),
  F('dora', 'Dora the Explorer', 'Adventurous girl with Backpack and Boots', 'cartoon', 1, 'f c:us~ r:latam~ cartoon human kid liveaction'),
  F('toothless', 'Toothless', 'Night Fury dragon from How to Train Your Dragon', 'cartoon', 2, 'm book cartoon reptile animal+ black fly tail talk- liveaction'),
  // TV, films, books and toys
  F('elmo', 'Elmo', 'Little red monster from Sesame Street', 'tv', 2, 'm c:us liveaction monster red kid'),
  F('cookiemonster', 'Cookie Monster', 'Blue monster who loves cookies', 'tv', 1, 'm c:us liveaction monster blue food'),
  F('kermit', 'Kermit the Frog', 'Green frog who leads the Muppets', 'tv', 1, 'm c:us liveaction animal green sing~'),
  F('thomas', 'Thomas the Tank Engine', 'Cheeky blue engine from the Island of Sodor', 'tv', 1, 'm c:uk book cartoon+ object blue liveaction~'),
  F('mrbean', 'Mr. Bean', 'Bumbling, almost silent Englishman', 'movie', 2, 'm c:uk liveaction cartoon~ human talk-'),
  F('grinch', 'The Grinch', 'Green grump who tried to steal Christmas', 'book', 2, 'm book cartoon+ liveaction+ green villain~ monster~'),
  F('paddington', 'Paddington Bear', 'Marmalade-loving bear from Peru', 'book', 2, 'm c:pe c:uk~ book liveaction animal bear hat food brown blue~'),
  F('peterpan', 'Peter Pan', 'The boy who never grows up', 'book', 1, 'm c:uk~ book cartoon disney human kid fly green hat sword~ liveaction~'),
  F('pinocchio', 'Pinocchio', 'Wooden puppet who wants to be a real boy', 'book', 1, 'm c:it book cartoon disney toy+ object~ kid liveaction+'),
  F('dracula', 'Count Dracula', 'Vampire from Transylvania', 'book', 1, 'm c:ro book liveaction monster villain cape fly~ black magic~'),
  F('harry', 'Harry Potter', 'The Boy Who Lived', 'book', 3, 'm c:uk book harrypotter liveaction human magic glasses kid+ fly~'),
  F('hermione', 'Hermione Granger', "Brilliant witch and Harry's best friend", 'book', 2, 'f c:uk book harrypotter liveaction human magic kid+ sidekick~'),
  F('voldemort', 'Lord Voldemort', 'Dark wizard, "He Who Must Not Be Named"', 'book', 2, 'm c:uk book harrypotter liveaction human+ villain magic bald white~'),
  F('dumbledore', 'Albus Dumbledore', 'Headmaster of Hogwarts', 'book', 1, 'm c:uk book harrypotter liveaction human magic beard glasses'),
  F('gandalf', 'Gandalf', 'Wizard from The Lord of the Rings', 'book', 2, 'm book liveaction human~ magic beard hat+ sword+ white~'),
  F('bond', 'James Bond', 'British secret agent 007', 'book', 2, 'm c:uk book liveaction human military+'),
  F('sherlock', 'Sherlock Holmes', 'Famous detective of 221B Baker Street', 'book', 1, 'm c:uk book liveaction human hat~'),
  F('sparrow', 'Captain Jack Sparrow', 'Pirate captain of the Black Pearl', 'movie', 2, 'm liveaction human hat water sword beard'),
  F('wednesday', 'Wednesday Addams', 'Gloomy, clever girl of the Addams Family', 'movie', 2, 'f c:us comic~ liveaction human kid black powers~'),
  F('godzilla', 'Godzilla', 'Giant monster that stomps through Tokyo', 'movie', 2, 'm~ japan c:jp liveaction monster reptile green~ villain~ !talk'),
  F('kingkong', 'King Kong', 'Giant ape from Skull Island', 'movie', 1, 'm liveaction monster animal+ black+ brown~ !talk'),
  F('barbie', 'Barbie', 'Famous fashion doll and film star', 'toy', 2, 'f c:us toy liveaction cartoon~ human~ pink'),
  F('optimus', 'Optimus Prime', 'Leader of the Autobots', 'toy', 2, 'm japan~ toy cartoon+ liveaction robot alien+ object~ red+ blue~ space~'),
  F('vader', 'Darth Vader', 'Sith Lord in black armour', 'movie', 3, 'm starwars liveaction villain+ human+ robot- mask cape black sword powers space military~'),
  F('yoda', 'Yoda', 'Small, wise Jedi Master', 'movie', 2, 'm starwars liveaction alien green powers magic~ sword space'),
  F('grogu', 'Grogu', '"Baby Yoda" from The Mandalorian', 'movie', 2, 'm starwars liveaction alien green kid powers space !talk'),
  F('r2d2', 'R2-D2', 'Brave, beeping astromech droid', 'movie', 1, 'm~ starwars liveaction robot white+ blue~ space !talk'),
  F('chewbacca', 'Chewbacca', 'Wookiee co-pilot of the Millennium Falcon', 'movie', 1, 'm starwars liveaction alien brown sidekick+ space !talk'),
  F('skibidi', 'Skibidi Toilet', 'Singing head in a toilet from the YouTube series', 'online', 2, 'm~ youtube cartoon+ object villain sing human-'),
  // comic heroes and villains
  F('spiderman', 'Spider-Man', 'Peter Parker, your friendly neighbourhood hero', 'hero', 3, 'm c:us comic marvel superhero liveaction cartoon~ human powers mask red+ blue~ kid~'),
  F('batman', 'Batman', 'Bruce Wayne, the Dark Knight of Gotham', 'hero', 3, 'm c:us comic dc superhero liveaction cartoon~ human mask cape black rich business~'),
  F('superman', 'Superman', 'Man of Steel from the planet Krypton', 'hero', 3, 'm c:us+ comic dc superhero liveaction cartoon~ alien human~ powers fly cape blue+ red~ space~ glasses-'),
  F('wonderwoman', 'Wonder Woman', 'Amazon princess and warrior', 'hero', 2, 'f comic dc superhero liveaction human~ powers royal military~ sword~ red~ blue~'),
  F('ironman', 'Iron Man', 'Tony Stark, genius inventor in a suit of armour', 'hero', 3, 'm c:us comic marvel superhero liveaction human fly science rich business+ red+ beard mask+ space~ robot-'),
  F('hulk', 'The Hulk', 'Huge green hero who gets stronger when angry', 'hero', 2, 'm c:us comic marvel superhero liveaction human~ monster~ powers green science~'),
  F('capamerica', 'Captain America', 'Super-soldier with a star-spangled shield', 'hero', 2, 'm c:us comic marvel superhero liveaction human military powers~ blue+ red~ mask~'),
  F('thor', 'Thor', 'Norse god of thunder with a mighty hammer', 'hero', 2, 'm comic marvel superhero liveaction human- powers fly cape royal beard+ space~'),
  F('blackpanther', 'Black Panther', 'King of Wakanda', 'hero', 2, 'm r:africa comic marvel superhero liveaction human royal mask black powers+ rich~'),
  F('deadpool', 'Deadpool', 'Wisecracking mercenary in red', 'hero', 2, 'm c:ca comic marvel liveaction human superhero~ villain- mask red sword powers+'),
  F('flash', 'The Flash', 'The fastest man alive', 'hero', 1, 'm c:us comic dc superhero liveaction human powers fast red mask'),
  F('joker', 'The Joker', "Batman's chaotic arch-enemy", 'hero', 2, 'm c:us comic dc liveaction villain human green~ purple~ white~'),
  F('thanos', 'Thanos', 'Mad Titan who collected the Infinity Stones', 'hero', 2, 'm comic marvel liveaction villain alien purple space bald+ powers+'),
  F('groot', 'Groot', 'Tree-like hero who says "I am Groot"', 'hero', 1, 'm comic marvel liveaction alien brown talk- space superhero~'),
  // anime
  F('goku', 'Goku', 'Saiyan hero of Dragon Ball', 'anime', 3, 'm japan c:jp~ anime cartoon alien+ human~ powers fly orange spiky food+ tail~ space~ liveaction~'),
  F('naruto', 'Naruto Uzumaki', 'Orange-clad ninja of the Hidden Leaf Village', 'anime', 2, 'm japan c:jp~ anime cartoon human powers orange spiky kid+ food~'),
  F('luffy', 'Monkey D. Luffy', 'Rubber-bodied pirate in a straw hat', 'anime', 2, 'm japan anime cartoon human powers hat water red~ food+ liveaction'),
  F('pikachu', 'Pikachu', 'Electric mouse Pokémon', 'anime', 3, 'm~ japan c:jp+ videogame anime cartoon pokemon animal+ mouse~ yellow tail powers talk- liveaction+'),
  F('ash', 'Ash Ketchum', 'Pokémon trainer from Pallet Town', 'anime', 2, 'm japan c:jp+ anime cartoon pokemon videogame~ human kid hat'),
  F('charizard', 'Charizard', 'Fire-breathing dragon Pokémon', 'anime', 1, 'm~ japan c:jp+ videogame anime cartoon pokemon reptile animal+ orange fly tail powers+ !talk liveaction~'),
  F('doraemon', 'Doraemon', 'Robot cat from the future', 'anime', 1, 'm japan c:jp anime cartoon robot cat~ blue'),
  // video games
  F('mario', 'Mario', 'Moustached plumber hero of the Mushroom Kingdom', 'game', 3, 'm japan videogame mario cartoon~ human red+ blue~ hat beard talk~'),
  F('luigi', 'Luigi', "Mario's taller brother in green", 'game', 2, 'm japan videogame mario cartoon~ human green hat beard sidekick~ talk~'),
  F('peach', 'Princess Peach', 'Princess of the Mushroom Kingdom', 'game', 2, 'f japan videogame mario cartoon~ human royal pink'),
  F('bowser', 'Bowser', 'Fire-breathing King of the Koopas', 'game', 2, 'm japan videogame mario cartoon~ villain reptile animal~ monster+ royal green~ orange~ tail spiky'),
  F('yoshi', 'Yoshi', 'Friendly green dinosaur', 'game', 2, 'm~ japan videogame mario cartoon~ reptile animal+ green tail food+ sidekick~ talk-'),
  F('dk', 'Donkey Kong', 'Banana-loving gorilla', 'game', 1, 'm japan videogame mario~ cartoon~ animal brown food+ villain- talk-'),
  F('link', 'Link', 'Sword-wielding hero of the Zelda games', 'game', 2, 'm japan videogame human+ green hat+ sword !talk'),
  F('kirby', 'Kirby', 'Pink puffball who copies powers', 'game', 2, 'm~ japan videogame cartoon~ pink food powers fly+ talk-'),
  F('pacman', 'Pac-Man', 'Yellow dot-munching arcade hero', 'game', 1, 'm~ japan videogame yellow food !talk liveaction-'),
  F('sonic', 'Sonic the Hedgehog', 'Super-fast blue hedgehog', 'game', 3, 'm japan videogame sonic cartoon~ animal blue fast powers+ spiky+ tail~ liveaction'),
  F('tails', 'Tails', "Two-tailed flying fox, Sonic's best friend", 'game', 2, 'm japan videogame sonic cartoon~ animal orange fly tail kid sidekick science+ liveaction'),
  F('knuckles', 'Knuckles', 'Red echidna who guards the Master Emerald', 'game', 1, 'm japan videogame sonic cartoon~ animal red spiky~ powers~ liveaction'),
  F('eggman', 'Dr. Eggman', "Sonic's egg-shaped evil genius rival", 'game', 2, 'm japan videogame sonic cartoon~ human villain science bald beard glasses red+ liveaction'),
  F('steve', 'Steve', 'Blocky hero of Minecraft', 'game', 3, 'm videogame minecraft human blue+ sword~ talk~ liveaction'),
  F('creeper', 'Creeper', 'Green exploding mob from Minecraft', 'game', 2, 'videogame minecraft monster green villain+ !talk liveaction'),
  F('masterchief', 'Master Chief', 'Armoured super-soldier from Halo', 'game', 1, 'm videogame human military green mask space liveaction'),
  F('lara', 'Lara Croft', 'Tomb-raiding adventurer', 'game', 1, 'f c:uk videogame human liveaction'),
  F('kratos', 'Kratos', 'Spartan warrior from God of War', 'game', 1, 'm c:gr videogame human~ powers+ military+ bald beard white~ sword~ liveaction?'),
  F('angryred', 'Red', 'The angry red bird from Angry Birds', 'game', 1, 'm videogame cartoon~ animal bird red'),
];

export const CHARACTERS = [...PEOPLE, ...FICTION];

// ---- turning tags into numbers ----
const SUFFIX = { '+': 0.75, '~': 0.5, '-': 0.25 };
const SPECIES = ['cat', 'dog', 'mouse', 'bear', 'pig', 'rabbit', 'bird', 'fish'];
const SPORTS = ['football', 'coach', 'rugby', 'cricket', 'tennis', 'athletics', 'basketball', 'motor', 'fighting', 'swimming', 'gymnastics'];

/** Parse one tag string into { facts: Map(tag -> value or null), countries: Map, regions: Map, by }. */
export function parseTags(str) {
  const facts = new Map(), countries = new Map(), regions = new Map(); let by = null;
  for (const raw of str.trim().split(/\s+/)) {
    if (/^by-?\d+$/.test(raw)) { by = Number(raw.slice(2)); continue; }
    let tok = raw, v = 1;
    if (tok.startsWith('!')) { tok = tok.slice(1); v = 0; }
    else if (tok.endsWith('?')) { tok = tok.slice(0, -1); v = null; }
    else if (SUFFIX[tok.at(-1)] !== undefined) { v = SUFFIX[tok.at(-1)]; tok = tok.slice(0, -1); }
    if (tok === 'dead') { facts.set('alive', 0); continue; }
    if (tok.startsWith('c:')) { countries.set(tok.slice(2), v ?? 0); continue; }
    if (tok.startsWith('r:')) { regions.set(tok.slice(2), v ?? 0); continue; }
    facts.set(tok, v);
  }
  return { facts, countries, regions, by };
}

/** Every bare tag the data may use (question ids plus helpers), for the tests' typo check. */
export const KNOWN_TAGS = new Set([...QUESTIONS.map(q => q.id), 'real']);

/**
 * The value of question q for a character: 1 yes … 0 no, or null when Moya has no idea (that question is skipped
 * for that character). Made-up characters skip 'real' questions and the other way round.
 */
export function valueOf(ch, q) {
  const t = ch._p || (ch._p = parseTags(ch.tags));
  const f = t.facts, real = f.get('real') === 1, id = q.id;
  if (id === 'real') return real ? 1 : 0;
  if (q.kind === 'real' && !real) return null;
  if (q.kind === 'fic' && real) return null;
  if (f.has(id)) return f.get(id);   // an explicit fact (or an explicit "unknown") always wins
  if (REGIONS.includes(id)) {
    let v = t.regions.get(id) ?? 0;
    for (const [c, cv] of t.countries) v = Math.max(v, (COUNTRY[c]?.[id] || 0) * cv);
    return v;
  }
  if (real) {
    if (id === 'alive') return 1;
    if (id === 'human' || id === 'talk') return 1;
    if (id === 'b2000' || id === 'b1950' || id === 'b1900') {
      if (t.by === null) return null;
      return id === 'b2000' ? +(t.by >= 2000) : id === 'b1950' ? +(t.by < 1950) : +(t.by < 1900);
    }
    if (id === 'grammy') return (f.get('musician') || 0) > 0 ? null : 0;   // musicians: only what was checked
    if (id === 'oscar') return (f.get('actor') || 0) > 0 || (f.get('musician') || 0) > 0 ? null : 0;
  } else if (id === 'talk') return 1;   // most made-up characters talk; the ones who don't are tagged !talk or talk-
  if (id === 'sport') return Math.max(...SPORTS.map(s => f.get(s) || 0));
  if (id === 'animal') return Math.max(f.get('animal') || 0, ...SPECIES.map(s => f.get(s) || 0));
  return real ? q.rd : 0;
}
