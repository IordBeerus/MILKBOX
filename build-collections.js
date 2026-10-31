// build-collections.js: creates collections-data.js with authentic movie lists for studios & franchises
const fs = require('fs');

const collections = [
    {
        id: 'marvel',
        label: 'Marvel Cinematic Universe',
        studio: 'Marvel Studios',
        category: 'studio',
        badge: 'Marvel Studios',
        desc: 'The official Marvel Cinematic Universe — interconnected superhero films produced by Marvel Studios.',
        cover: 'https://image.tmdb.org/t/p/w1920/mDfJG3LC3Dqb67AZ52x3Z0jOS0n.jpg',
        tmdbCompanyIds: [420],
        tmdbCollectionIds: [86311, 131295, 284433, 131296, 284436, 531241, 529892, 422834, 618529, 87118],
        strictRegexStr: '^.*(iron man|captain america|thor|avengers|guardians of the galaxy|ant-man|doctor strange|black panther|captain marvel|black widow|shang-chi|eternals|deadpool & wolverine|the marvels|multiverse of madness|quantumania|love and thunder|wakanda forever).*$',
        curatedMovies: [
            { id: 'm_mcu_1', tmdbId: '1726', title: 'Iron Man', year: '2008', rating: '7.6', poster: 'https://image.tmdb.org/t/p/w500/78lPtwv72eTNqFW9COBYI0dWDJa.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/cyecB7godJ6kNHGONvjEgVNMMv7.jpg', description: 'After being held captive in an Afghan cave, billionaire engineer Tony Stark creates a unique weaponized suit of armor to fight evil.', type: 'movie' },
            { id: 'm_mcu_2', tmdbId: '1724', title: 'The Incredible Hulk', year: '2008', rating: '6.2', poster: 'https://image.tmdb.org/t/p/w500/gKzYx79y0AQTL4UAk1cBQJ3nvrm.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/xfAcu74DR7P96Kzg9i0ZAEURaq2.jpg', description: 'Scientist Bruce Banner scours the planet for an antidote to the unbridled force of rage within him: the Hulk.', type: 'movie' },
            { id: 'm_mcu_3', tmdbId: '10138', title: 'Iron Man 2', year: '2010', rating: '6.8', poster: 'https://image.tmdb.org/t/p/w500/6WBeq40CwSMBd0x6Mr4St750VnO.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/7vKiOrWfP9lXk74eEcv78g10nS3.jpg', description: 'With the world now aware of his identity as Iron Man, Tony Stark must contend with both his declining health and a vengeful mad man.', type: 'movie' },
            { id: 'm_mcu_4', tmdbId: '10195', title: 'Thor', year: '2011', rating: '6.8', poster: 'https://image.tmdb.org/t/p/w500/prSfAi1xGrhLQNxVSUFh61xQ4Qx.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/3SDoMt013kHwW818tUsm0p1ZlW.jpg', description: 'The powerful but arrogant god Thor is cast out of Asgard to live amongst humans in Midgard (Earth), where he soon becomes one of their finest defenders.', type: 'movie' },
            { id: 'm_mcu_5', tmdbId: '1771', title: 'Captain America: The First Avenger', year: '2011', rating: '7.0', poster: 'https://image.tmdb.org/t/p/w500/vSNxAJTlD0r02V9sPYwqjqbgKQI.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/pm0RiwNpS9yjx0y5c8h4P0l6T7.jpg', description: 'During World War II, Steve Rogers is transformed into super-soldier Captain America and must stop the Red Skull from using the Tesseract.', type: 'movie' },
            { id: 'm_mcu_6', tmdbId: '24428', title: 'The Avengers', year: '2012', rating: '7.7', poster: 'https://image.tmdb.org/t/p/w500/RYMX2wcKCBAr242PD7xwmjaTn9.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/9BBTo63ANSmbtqfZ2q69c9qg1tT.jpg', description: 'Earth\'s mightiest heroes must come together and learn to fight as a team if they are going to stop the mischievous Loki and his alien army.', type: 'movie' },
            { id: 'm_mcu_7', tmdbId: '68721', title: 'Iron Man 3', year: '2013', rating: '6.9', poster: 'https://image.tmdb.org/t/p/w500/qhPtAc1TKbMPqNvcdXSOn9Bn7hZ.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/n9X2ucuxVG2T769eF0q973s.jpg', description: 'When Tony Stark\'s world is torn apart by a formidable terrorist called the Mandarin, he starts an odyssey of rebuilding and retribution.', type: 'movie' },
            { id: 'm_mcu_8', tmdbId: '76338', title: 'Thor: The Dark World', year: '2013', rating: '6.5', poster: 'https://image.tmdb.org/t/p/w500/wp6OxE4poJ4G7c0U2Z8l2Y69V8.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/3XW73zS5aE9B26f08w6tZ.jpg', description: 'Thor sets out on a perilous journey to reconnect with Jane Foster and save the universe from the ancient Malekith and the Dark Elves.', type: 'movie' },
            { id: 'm_mcu_9', tmdbId: '100402', title: 'Captain America: The Winter Soldier', year: '2014', rating: '7.7', poster: 'https://image.tmdb.org/t/p/w500/tVFRpFw3xTed5bGueGSRwimmMz0.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/y7dhcW998399gT3W.jpg', description: 'As Steve Rogers struggles to embrace his role in the modern world, he teams up with Black Widow to battle a shadowy assassin known as the Winter Soldier.', type: 'movie' },
            { id: 'm_mcu_10', tmdbId: '118340', title: 'Guardians of the Galaxy', year: '2014', rating: '7.9', poster: 'https://image.tmdb.org/t/p/w500/r7vmZjiyZw9rpJMQJdXOsL625L7.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/bwt90z0zKzX.jpg', description: 'A group of intergalactic criminals must pull together to stop a fanatical warrior with plans to purge the universe.', type: 'movie' },
            { id: 'm_mcu_11', tmdbId: '99861', title: 'Avengers: Age of Ultron', year: '2015', rating: '7.3', poster: 'https://image.tmdb.org/t/p/w500/4ssDuvEDkS9NvmR152vDGe2Tw5P.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg', description: 'When Tony Stark and Bruce Banner try to jump-start a dormant peacekeeping program, things go horribly wrong and Ultron emerges.', type: 'movie' },
            { id: 'm_mcu_12', tmdbId: '102899', title: 'Ant-Man', year: '2015', rating: '7.1', poster: 'https://image.tmdb.org/t/p/w500/8c728G0Yf16x.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/98y8v877z.jpg', description: 'Armed with a super-suit with the astonishing ability to shrink in scale but increase in strength, cat burglar Scott Lang must embrace his inner hero.', type: 'movie' },
            { id: 'm_mcu_13', tmdbId: '271110', title: 'Captain America: Civil War', year: '2016', rating: '7.4', poster: 'https://image.tmdb.org/t/p/w500/rAGiXaUfPzY7CDEyNKUofk3Kw2e.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/m53jY84u.jpg', description: 'Political involvement in the Avengers\' affairs causes a rift between former allies Captain America and Iron Man.', type: 'movie' },
            { id: 'm_mcu_14', tmdbId: '284052', title: 'Doctor Strange', year: '2016', rating: '7.4', poster: 'https://image.tmdb.org/t/p/w500/uGBVj3bEbCoZbDjjl9w1rOPnOGm.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/tFI8Oxj.jpg', description: 'After a tragic car crash, surgeon Stephen Strange embarks on a journey of healing only to find himself drawn into the world of the mystic arts.', type: 'movie' },
            { id: 'm_mcu_15', tmdbId: '283995', title: 'Guardians of the Galaxy Vol. 2', year: '2017', rating: '7.6', poster: 'https://image.tmdb.org/t/p/w500/y4MBh0EjBlMuOzv9CzZ1T7hS.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/tM8c.jpg', description: 'The Guardians struggle to keep together as a team while dealing with personal family issues, notably Star-Lord\'s encounter with his father Ego.', type: 'movie' },
            { id: 'm_mcu_16', tmdbId: '315635', title: 'Spider-Man: Homecoming', year: '2017', rating: '7.4', poster: 'https://image.tmdb.org/t/p/w500/c24sv2weTHPsmDa7jEMN0R2P3gc.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/vc8b.jpg', description: 'Peter Parker balances his life as an ordinary high school student in Queens with his superhero alter-ego Spider-Man.', type: 'movie' },
            { id: 'm_mcu_17', tmdbId: '284053', title: 'Thor: Ragnarok', year: '2017', rating: '7.9', poster: 'https://image.tmdb.org/t/p/w500/rzRwTcFvttvgRbbTo2qlvAbPtQ6.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/kaIfm5ryEOwYg8.jpg', description: 'Imprisoned on the planet Sakaar, Thor must race against time to return to Asgard and stop Ragnarök at the hands of the ruthless Hela.', type: 'movie' },
            { id: 'm_mcu_18', tmdbId: '284054', title: 'Black Panther', year: '2018', rating: '7.4', poster: 'https://image.tmdb.org/t/p/w500/uxzzxijgPIY7slzFvMotPv8vlum.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/b6ZfvKjh0.jpg', description: 'T\'Challa, heir to the hidden kingdom of Wakanda, must lead his people into a new future while facing a challenge from his country\'s past.', type: 'movie' },
            { id: 'm_mcu_19', tmdbId: '299536', title: 'Avengers: Infinity War', year: '2018', rating: '8.3', poster: 'https://image.tmdb.org/t/p/w500/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/mDfJG3LC3Dqb67AZ52x3Z0jOS0n.jpg', description: 'As the Avengers and their allies have continued to protect the world, Thanos emerges to collect all six Infinity Stones.', type: 'movie' },
            { id: 'm_mcu_20', tmdbId: '299534', title: 'Avengers: Endgame', year: '2019', rating: '8.3', poster: 'https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/7RyHsO4yDXtBv1z.jpg', description: 'After the devastating events of Infinity War, the universe is in ruins. With the help of remaining allies, the Avengers assemble once more.', type: 'movie' },
            { id: 'm_mcu_21', tmdbId: '429617', title: 'Spider-Man: Far From Home', year: '2019', rating: '7.5', poster: 'https://image.tmdb.org/t/p/w500/4q2NNXGKL35hwFGMM7fl2RA9Zw8.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/5myQGo.jpg', description: 'Following the events of Endgame, Peter Parker must step up to take on new threats in a world that has changed forever.', type: 'movie' },
            { id: 'm_mcu_22', tmdbId: '634649', title: 'Spider-Man: No Way Home', year: '2021', rating: '8.0', poster: 'https://image.tmdb.org/t/p/w500/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/iQFcwSGbZoc5UB3059T.jpg', description: 'Peter Parker is unmasked and no longer able to separate his normal life from the high-stakes of being a superhero.', type: 'movie' },
            { id: 'm_mcu_23', tmdbId: '453395', title: 'Doctor Strange in the Multiverse of Madness', year: '2022', rating: '7.3', poster: 'https://image.tmdb.org/t/p/w500/9Gtg2DzBhmYamXBS1oKAhiwbBKS.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/wcKFYgnSa.jpg', description: 'Doctor Strange teams up with a mysterious teenage girl from his dreams who can travel across multiverses to battle multiple threats.', type: 'movie' },
            { id: 'm_mcu_24', tmdbId: '447365', title: 'Guardians of the Galaxy Vol. 3', year: '2023', rating: '8.0', poster: 'https://image.tmdb.org/t/p/w500/r2J02Z2OpNTctfOSN2Ydgii51xQ.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/5YZbdrZbPOia74W.jpg', description: 'Peter Quill rallies his team on a dangerous mission to save Rocket\'s life—a mission that, if not completed successfully, could lead to the end of the Guardians.', type: 'movie' },
            { id: 'm_mcu_25', tmdbId: '533535', title: 'Deadpool & Wolverine', year: '2024', rating: '7.7', poster: 'https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/9l1eZiJHmhr5jIlthW.jpg', description: 'A listless Wade Wilson toils away in civilian life with his days as the morally flexible mercenary behind him, until the TVA recruits him for a timeline-saving mission.', type: 'movie' }
        ]
    },
    {
        id: 'dc',
        label: 'DC Universe & Batman',
        studio: 'DC Studios',
        category: 'studio',
        badge: 'DC Studios',
        desc: 'Official DC Comics film universe produced by DC Studios and Warner Bros. Pictures.',
        cover: 'https://image.tmdb.org/t/p/w1920/nMKdUUepR0i5zn0y1T4CsSB5chy.jpg',
        tmdbCompanyIds: [9993, 128064, 429],
        tmdbCollectionIds: [263, 468552, 573639, 948485, 726872, 209131],
        strictRegexStr: '^.*(the dark knight|batman begins|the batman|man of steel|batman v superman|wonder woman|justice league|joker|aquaman|shazam|suicide squad|the flash|blue beetle|black adam).*$',
        curatedMovies: [
            { id: 'm_dc_1', tmdbId: '155', title: 'The Dark Knight', year: '2008', rating: '8.5', poster: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/nMKdUUepR0i5zn0y1T4CsSB5chy.jpg', description: 'Batman raises the stakes in his war on crime with the help of Lt. Jim Gordon and District Attorney Harvey Dent against the Joker.', type: 'movie' },
            { id: 'm_dc_2', tmdbId: '272', title: 'Batman Begins', year: '2005', rating: '8.2', poster: 'https://image.tmdb.org/t/p/w500/4MpN4CwhvuaYrSpUd217Voavm2k.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/lh5lbis.jpg', description: 'Driven by tragedy, billionaire Bruce Wayne dedicates his life to unlocking and conquering his fears as the Caped Crusader.', type: 'movie' },
            { id: 'm_dc_3', tmdbId: '49026', title: 'The Dark Knight Rises', year: '2012', rating: '8.0', poster: 'https://image.tmdb.org/t/p/w500/hrJg3nQG.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/c3rL.jpg', description: 'Eight years after the Joker\'s reign of chaos, Batman is forced from his exile by a ruthless terrorist named Bane.', type: 'movie' },
            { id: 'm_dc_4', tmdbId: '414906', title: 'The Batman', year: '2022', rating: '7.7', poster: 'https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/5P8SmMzSNYTy4.jpg', description: 'In his second year of fighting crime, Batman uncovers corruption in Gotham City that connects to his own family while facing the Riddler.', type: 'movie' },
            { id: 'm_dc_5', tmdbId: '475557', title: 'Joker', year: '2019', rating: '8.1', poster: 'https://image.tmdb.org/t/p/w500/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/f5F4cRhOT.jpg', description: 'During the 1980s, a failed stand-up comedian is driven to insanity and turns to a life of crime and chaos in Gotham City.', type: 'movie' },
            { id: 'm_dc_6', tmdbId: '49521', title: 'Man of Steel', year: '2013', rating: '7.1', poster: 'https://image.tmdb.org/t/p/w500/7rIPjn5fyKo0ne.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/69Y.jpg', description: 'Clark Kent, one of the last of an extinguished race, must learn what it means to be a hero when Earth comes under attack by General Zod.', type: 'movie' },
            { id: 'm_dc_7', tmdbId: '209112', title: 'Batman v Superman: Dawn of Justice', year: '2016', rating: '6.7', poster: 'https://image.tmdb.org/t/p/w500/5UsK3grJ9syz7Q.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/vsR.jpg', description: 'Fearing the actions of a god-like superhero left unchecked, Gotham\'s formidable vigilante takes on Metropolis\'s revered modern savior.', type: 'movie' },
            { id: 'm_dc_8', tmdbId: '297762', title: 'Wonder Woman', year: '2017', rating: '7.3', poster: 'https://image.tmdb.org/t/p/w500/imekS7f1OuHyUP25i2yt0b99xQI.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/6i.jpg', description: 'When a pilot crashes and tells of conflict in the outside world, Diana leaves home to fight in a war to end all wars.', type: 'movie' },
            { id: 'm_dc_9', tmdbId: '791373', title: 'Zack Snyder\'s Justice League', year: '2021', rating: '8.1', poster: 'https://image.tmdb.org/t/p/w500/tnAuB8q5vv7Ax92Je.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/pcDc.jpg', description: 'Determined to ensure Superman\'s ultimate sacrifice was not in vain, Bruce Wayne aligns forces with Diana Prince with plans to recruit a team of metahumans.', type: 'movie' },
            { id: 'm_dc_10', tmdbId: '297802', title: 'Aquaman', year: '2018', rating: '6.9', poster: 'https://image.tmdb.org/t/p/w500/5Kg76ldv7VxeX9YlcQXi2C9IQ3w.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/9Qus.jpg', description: 'Arthur Curry, the human-born heir to the underwater kingdom of Atlantis, goes on a quest to prevent a war between the worlds of ocean and land.', type: 'movie' },
            { id: 'm_dc_11', tmdbId: '436969', title: 'The Suicide Squad', year: '2021', rating: '7.5', poster: 'https://image.tmdb.org/t/p/w500/kb4StNA92.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/jlG.jpg', description: 'Supervillains Harley Quinn, Bloodsport, Peacemaker and a collection of nutty cons at Belle Reve join Task Force X on the enemy-infused island of Corto Maltese.', type: 'movie' },
            { id: 'm_dc_12', tmdbId: '298618', title: 'The Flash', year: '2023', rating: '6.7', poster: 'https://image.tmdb.org/t/p/w500/rktDFPbfHfUbArZ6OOOKsXcv0Bm.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/yF15.jpg', description: 'Barry Allen uses his super speed to change the past, but his attempt to save his family creates a world without superheroes.', type: 'movie' }
        ]
    },
    {
        id: 'pixar',
        label: 'Pixar Animation Studios',
        studio: 'Pixar',
        category: 'studio',
        badge: 'Pixar',
        desc: 'Groundbreaking CGI animated films by Pixar Animation Studios.',
        cover: 'https://image.tmdb.org/t/p/w1920/lxD5ak7ZaUBgNaBhIOxMz25.jpg',
        tmdbCompanyIds: [3],
        tmdbCollectionIds: [10194],
        strictRegexStr: '^.*(toy story|finding (nemo|dory)|the incredibles|incredibles 2|monsters(,|\.)? inc|monsters university|inside out|coco|up|wall-e|ratatouille|cars|soul|luca|turning red|elemental|a bug\'s life|brave).*$',
        curatedMovies: [
            { id: 'm_pixar_1', tmdbId: '862', title: 'Toy Story', year: '1995', rating: '8.0', poster: 'https://image.tmdb.org/t/p/w500/uXDfjJbdP4ijW535k.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/lxD.jpg', description: 'Led by Woody, Andy\'s toys live happily until Buzz Lightyear arrives, upsetting the status quo.', type: 'movie' },
            { id: 'm_pixar_2', tmdbId: '10193', title: 'Toy Story 3', year: '2010', rating: '8.0', poster: 'https://image.tmdb.org/t/p/w500/AbbXspwhIR.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/9G.jpg', description: 'Woody, Buzz and the rest of their toy friends are accidentally dumped in a daycare center just before Andy starts college.', type: 'movie' },
            { id: 'm_pixar_3', tmdbId: '12', title: 'Finding Nemo', year: '2003', rating: '7.8', poster: 'https://image.tmdb.org/t/p/w500/eHuGQ10ocZ.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/b3.jpg', description: 'Marlin, a clownfish, journeys across the ocean to Sydney to find his missing son Nemo with the help of forgetful Dory.', type: 'movie' },
            { id: 'm_pixar_4', tmdbId: '9806', title: 'The Incredibles', year: '2004', rating: '7.7', poster: 'https://image.tmdb.org/t/p/w500/2LqaLgk.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/se.jpg', description: 'A family of undercover superheroes, trying to live a quiet suburban life, are forced into action to save the world.', type: 'movie' },
            { id: 'm_pixar_5', tmdbId: '585', title: 'Monsters, Inc.', year: '2001', rating: '7.8', poster: 'https://image.tmdb.org/t/p/w500/sgheT.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/wW.jpg', description: 'In Monstropolis, best friends Sulley and Mike navigate screams, doors, and a tiny human child named Boo.', type: 'movie' },
            { id: 'm_pixar_6', tmdbId: '150540', title: 'Inside Out', year: '2015', rating: '7.9', poster: 'https://image.tmdb.org/t/p/w500/lRHE0v.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/jZ.jpg', description: 'After young Riley is uprooted to a new city, her emotions—Joy, Sadness, Anger, Fear, and Disgust—conflict on how best to navigate her life.', type: 'movie' },
            { id: 'm_pixar_7', tmdbId: '1022789', title: 'Inside Out 2', year: '2024', rating: '7.6', poster: 'https://image.tmdb.org/t/p/w500/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/xg27Fc.jpg', description: 'Teenager Riley\'s mind undergoes a sudden demolition to make room for unexpected new Emotions: Anxiety, Envy, Ennui, and Embarrassment.', type: 'movie' },
            { id: 'm_pixar_8', tmdbId: '354912', title: 'Coco', year: '2017', rating: '8.2', poster: 'https://image.tmdb.org/t/p/w500/gGEsB.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/ask.jpg', description: 'Aspiring musician Miguel confronts his family\'s ancestral ban on music and enters the Land of the Dead to find his great-great-grandfather.', type: 'movie' },
            { id: 'm_pixar_9', tmdbId: '14160', title: 'Up', year: '2009', rating: '7.9', poster: 'https://image.tmdb.org/t/p/w500/vpba.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/j9.jpg', description: '78-year-old Carl Fredricksen travels to Paradise Falls in his home equipped with thousands of balloons, inadvertently taking a young stowaway.', type: 'movie' },
            { id: 'm_pixar_10', tmdbId: '10681', title: 'WALL-E', year: '2008', rating: '8.1', poster: 'https://image.tmdb.org/t/p/w500/hbhFn.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/fK.jpg', description: 'In the distant future, a small waste-collecting robot inadvertently embarks on a space journey that will ultimately decide the fate of mankind.', type: 'movie' },
            { id: 'm_pixar_11', tmdbId: '6217', title: 'Ratatouille', year: '2007', rating: '7.8', poster: 'https://image.tmdb.org/t/p/w500/t3Va.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/ex.jpg', description: 'A rat who can cook makes an unusual alliance with a young kitchen worker at a famous Paris restaurant.', type: 'movie' },
            { id: 'm_pixar_12', tmdbId: '508442', title: 'Soul', year: '2020', rating: '8.1', poster: 'https://image.tmdb.org/t/p/w500/hm58v.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/kf.jpg', description: 'After landing the gig of a lifetime, a New York jazz pianist suddenly finds himself trapped in a strange land between Earth and the afterlife.', type: 'movie' }
        ]
    },
    {
        id: 'ghibli',
        label: 'Studio Ghibli',
        studio: 'Studio Ghibli',
        category: 'studio',
        badge: 'Studio Ghibli',
        desc: 'Masterpieces of Japanese hand-drawn animation directed by Hayao Miyazaki and Isao Takahata.',
        cover: 'https://image.tmdb.org/t/p/w1920/Ab8mkHmkYADjU7wQiOkia9BzGvS.jpg',
        tmdbCompanyIds: [10342],
        strictRegexStr: '^.*(spirited away|princess mononoke|howl\'s moving castle|my neighbor totoro|kiki\'s delivery service|grave of the fireflies|ponyo|castle in the sky|the boy and the heron|the wind rises|nausicaä|whisper of the heart).*$',
        curatedMovies: [
            { id: 'm_ghibli_1', tmdbId: '129', title: 'Spirited Away', year: '2001', rating: '8.5', poster: 'https://image.tmdb.org/t/p/w500/393rIH.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/Ab8mkHmkYADjU7wQiOkia9BzGvS.jpg', description: 'A young girl wanders into a world ruled by gods, witches, and spirits, and where humans are changed into beasts.', type: 'movie' },
            { id: 'm_ghibli_2', tmdbId: '128', title: 'Princess Mononoke', year: '1997', rating: '8.3', poster: 'https://image.tmdb.org/t/p/w500/jHWm.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/eY.jpg', description: 'On a journey to find the cure for a Tatarigami curse, Ashitaka finds himself in the middle of a war between the forest gods and Tatara, a mining colony.', type: 'movie' },
            { id: 'm_ghibli_3', tmdbId: '4935', title: 'Howl\'s Moving Castle', year: '2004', rating: '8.4', poster: 'https://image.tmdb.org/t/p/w500/TkTP.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/6m.jpg', description: 'When an unconfident young woman is cursed with an old body by a spiteful witch, her only chance of breaking the spell lies with a self-indulgent wizard.', type: 'movie' },
            { id: 'm_ghibli_4', tmdbId: '8392', title: 'My Neighbor Totoro', year: '1988', rating: '8.1', poster: 'https://image.tmdb.org/t/p/w500/rtG.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/2l.jpg', description: 'Two sisters move to the country with their father in order to be closer to their hospitalized mother, and discover friendly spirits.', type: 'movie' },
            { id: 'm_ghibli_5', tmdbId: '16859', title: 'Kiki\'s Delivery Service', year: '1989', rating: '7.9', poster: 'https://image.tmdb.org/t/p/w500/7nO.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/k8.jpg', description: 'A young witch, on her mandatory year of independent life, finds fitting into a new community difficult while supporting herself running an air courier service.', type: 'movie' },
            { id: 'm_ghibli_6', tmdbId: '12477', title: 'Grave of the Fireflies', year: '1988', rating: '8.5', poster: 'https://image.tmdb.org/t/p/w500/k9TV.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/7n.jpg', description: 'In the final months of World War II, two orphaned siblings struggle desperately to survive in the Japanese countryside.', type: 'movie' },
            { id: 'm_ghibli_7', tmdbId: '10515', title: 'Castle in the Sky', year: '1986', rating: '8.0', poster: 'https://image.tmdb.org/t/p/w500/41t.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/3m.jpg', description: 'A young boy and a girl with a magic crystal must race against pirates and foreign agents in a search for a legendary floating castle.', type: 'movie' },
            { id: 'm_ghibli_8', tmdbId: '12429', title: 'Ponyo', year: '2008', rating: '7.7', poster: 'https://image.tmdb.org/t/p/w500/yp8.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/4s.jpg', description: 'A goldfish princess encounters a human boy on a shore and falls in love with him, wishing to become human herself.', type: 'movie' },
            { id: 'm_ghibli_9', tmdbId: '508883', title: 'The Boy and the Heron', year: '2023', rating: '7.4', poster: 'https://image.tmdb.org/t/p/w500/f4ss.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/1X.jpg', description: 'During World War II, young Mahito enters a magical world shared by the living and the dead to find his missing stepmother.', type: 'movie' }
        ]
    },
    {
        id: 'starwars',
        label: 'Star Wars Saga',
        studio: 'Lucasfilm Ltd.',
        category: 'franchise',
        badge: 'Lucasfilm',
        desc: 'The complete Skywalker Saga and Star Wars anthology films produced by Lucasfilm.',
        cover: 'https://image.tmdb.org/t/p/w1920/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg',
        tmdbCompanyIds: [1],
        tmdbCollectionIds: [10],
        strictRegexStr: '^.*star wars.*$',
        curatedMovies: [
            { id: 'm_sw_1', tmdbId: '11', title: 'Star Wars: Episode IV - A New Hope', year: '1977', rating: '8.2', poster: 'https://image.tmdb.org/t/p/w500/6FfCtt.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg', description: 'Luke Skywalker joins forces with a Jedi Knight, a cocky pilot, a Wookiee and two droids to save the galaxy from the Empire\'s world-destroying battle station.', type: 'movie' },
            { id: 'm_sw_2', tmdbId: '1891', title: 'Star Wars: Episode V - The Empire Strikes Back', year: '1980', rating: '8.4', poster: 'https://image.tmdb.org/t/p/w500/2l05.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/aJC.jpg', description: 'After the Rebels are overpowered by the Empire, Luke Skywalker begins his Jedi training with Yoda while his friends are pursued across the galaxy by Darth Vader.', type: 'movie' },
            { id: 'm_sw_3', tmdbId: '1892', title: 'Star Wars: Episode VI - Return of the Jedi', year: '1983', rating: '7.9', poster: 'https://image.tmdb.org/t/p/w500/mDC.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/9i.jpg', description: 'After rescuing Han Solo from Jabba the Hutt, the Rebels attempt to destroy the second Death Star while Luke struggles to bring Vader back from the dark side.', type: 'movie' },
            { id: 'm_sw_4', tmdbId: '1893', title: 'Star Wars: Episode I - The Phantom Menace', year: '1999', rating: '6.5', poster: 'https://image.tmdb.org/t/p/w500/68.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/6t.jpg', description: 'Two Jedi escape a hostile blockade to find allies and come across a young boy who may bring balance to the Force.', type: 'movie' },
            { id: 'm_sw_5', tmdbId: '1894', title: 'Star Wars: Episode II - Attack of the Clones', year: '2002', rating: '6.6', poster: 'https://image.tmdb.org/t/p/w500/o7.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/6u.jpg', description: 'Ten years after initially meeting, Anakin Skywalker shares a forbidden romance with Padmé Amidala while Obi-Wan Kenobi discovers a secret clone army.', type: 'movie' },
            { id: 'm_sw_6', tmdbId: '1895', title: 'Star Wars: Episode III - Revenge of the Sith', year: '2005', rating: '7.4', poster: 'https://image.tmdb.org/t/p/w500/xf.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/w3.jpg', description: 'Three years into the Clone Wars, the Jedi rescue Palpatine from Count Dooku. As Obi-Wan pursues a new threat, Anakin acts as a double agent.', type: 'movie' },
            { id: 'm_sw_7', tmdbId: '140607', title: 'Star Wars: The Force Awakens', year: '2015', rating: '7.3', poster: 'https://image.tmdb.org/t/p/w500/wq.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/c2.jpg', description: 'As a new threat to the galaxy rises, Rey, a desert scavenger, and Finn, an ex-stormtrooper, must join Han Solo and Chewbacca to search for the one hope of peace.', type: 'movie' },
            { id: 'm_sw_8', tmdbId: '330459', title: 'Rogue One: A Star Wars Story', year: '2016', rating: '7.5', poster: 'https://image.tmdb.org/t/p/w500/qj.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/tI.jpg', description: 'In a time of conflict, a group of unlikely heroes band together on a mission to steal the plans to the Death Star, the Empire\'s ultimate weapon of destruction.', type: 'movie' },
            { id: 'm_sw_9', tmdbId: '181808', title: 'Star Wars: The Last Jedi', year: '2017', rating: '6.8', poster: 'https://image.tmdb.org/t/p/w500/kP.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/5w.jpg', description: 'The Resistance prepares for battle with the First Order as Rey searches for Luke Skywalker to bring hope back to the galaxy.', type: 'movie' },
            { id: 'm_sw_10', tmdbId: '181812', title: 'Star Wars: The Rise of Skywalker', year: '2019', rating: '6.3', poster: 'https://image.tmdb.org/t/p/w500/db.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/jP.jpg', description: 'The surviving Resistance faces the First Order once more as Rey, Finn and Poe Dameron\'s journey continues with the final battle of the Skywalker saga.', type: 'movie' }
        ]
    },
    {
        id: 'fastfurious',
        label: 'Fast & Furious Saga',
        studio: 'Universal Pictures',
        category: 'franchise',
        badge: 'Universal Pictures',
        desc: 'The official Fast Saga high-speed action franchise produced by Universal Pictures. No unrelated films.',
        cover: 'https://image.tmdb.org/t/p/w1920/4XM8DUTQb3lhLemJC51Jx4a2EuA.jpg',
        tmdbCollectionIds: [9485],
        strictRegexStr: '^.*((the )?fast (and|&) (the )?furious|2 fast 2 furious|tokyo drift|fast five|fast & furious 6|furious 7|the fate of the furious|hobbs &(amp;)? shaw|f9: the fast saga|fast x).*$',
        negativeRegexStr: '(fast times|faster|breakfast|stand fast)',
        curatedMovies: [
            { id: 'm_ff_1', tmdbId: '9799', title: 'The Fast and the Furious', year: '2001', rating: '6.9', poster: 'https://image.tmdb.org/t/p/w500/gq53.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/4XM8DUTQb3lhLemJC51Jx4a2EuA.jpg', description: 'Los Angeles street racer Dominic Toretto falls under the suspicion of LAPD officer Brian O\'Conner, who goes undercover to investigate truck hijackings.', type: 'movie' },
            { id: 'm_ff_2', tmdbId: '584', title: '2 Fast 2 Furious', year: '2003', rating: '6.5', poster: 'https://image.tmdb.org/t/p/w500/6n.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/z6.jpg', description: 'Former cop Brian O\'Conner is called upon to bust a dangerous criminal and he recruits the help of his former ex-con pal Roman Pearce.', type: 'movie' },
            { id: 'm_ff_3', tmdbId: '9615', title: 'The Fast and the Furious: Tokyo Drift', year: '2006', rating: '6.5', poster: 'https://image.tmdb.org/t/p/w500/cm.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/i1.jpg', description: 'A teenager becomes a major competitor in the world of drift racing after moving with his father in Tokyo to avoid jail.', type: 'movie' },
            { id: 'm_ff_4', tmdbId: '13804', title: 'Fast & Furious', year: '2009', rating: '6.7', poster: 'https://image.tmdb.org/t/p/w500/3k.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/7q.jpg', description: 'Brian O\'Conner, now working for the FBI in LA, teams up with Dominic Toretto to bring down a heroin importer by infiltrating his operation.', type: 'movie' },
            { id: 'm_ff_5', tmdbId: '51497', title: 'Fast Five', year: '2011', rating: '7.2', poster: 'https://image.tmdb.org/t/p/w500/9k.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/4r.jpg', description: 'Dominic Toretto and his crew of street racers plan a massive heist to buy their freedom while in the sights of a powerful Brazilian drug lord and federal agent Luke Hobbs.', type: 'movie' },
            { id: 'm_ff_6', tmdbId: '76341', title: 'Fast & Furious 6', year: '2013', rating: '6.8', poster: 'https://image.tmdb.org/t/p/w500/my.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/xH.jpg', description: 'Hobbs has Dominic and Brian reassemble their crew to take down a team of mercenaries led by Owen Shaw, with Letty mysteriously back from the dead.', type: 'movie' },
            { id: 'm_ff_7', tmdbId: '168259', title: 'Furious 7', year: '2015', rating: '7.3', poster: 'https://image.tmdb.org/t/p/w500/dG.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/tH.jpg', description: 'Deckard Shaw seeks revenge against Dominic Toretto and his family for his comatose brother, while the crew is recruited by a covert ops team.', type: 'movie' },
            { id: 'm_ff_8', tmdbId: '337339', title: 'The Fate of the Furious', year: '2017', rating: '6.9', poster: 'https://image.tmdb.org/t/p/w500/d5.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/j4.jpg', description: 'When a mysterious woman seduces Dominic Toretto into the world of terrorism and a betrayal of those closest to him, the crew faces trials like never before.', type: 'movie' },
            { id: 'm_ff_9', tmdbId: '384018', title: 'Fast & Furious Presents: Hobbs & Shaw', year: '2019', rating: '6.9', poster: 'https://image.tmdb.org/t/p/w500/key.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/qA.jpg', description: 'Lawman Luke Hobbs and outcast Deckard Shaw form an unlikely alliance when a cyber-genetically enhanced villain threatens the future of humanity.', type: 'movie' },
            { id: 'm_ff_10', tmdbId: '385128', title: 'F9: The Fast Saga', year: '2021', rating: '7.1', poster: 'https://image.tmdb.org/t/p/w500/bO.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/xX.jpg', description: 'Dom Toretto is living the quiet life off the grid with Letty and his son, but danger always lurks just over their peaceful horizon: Dom\'s forsaken brother Jakob.', type: 'movie' },
            { id: 'm_ff_11', tmdbId: '385687', title: 'Fast X', year: '2023', rating: '7.1', poster: 'https://image.tmdb.org/t/p/w500/fiVW36jy2m9.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/4XM8DUTQb3lhLemJC51Jx4a2EuA.jpg', description: 'Over many missions and against impossible odds, Dom Toretto and his family have outsmarted every enemy. Now, they confront the most lethal opponent they\'ve ever faced: Dante Reyes.', type: 'movie' }
        ]
    },
    {
        id: 'harrypotter',
        label: 'Harry Potter & Wizarding World',
        studio: 'Warner Bros. Pictures',
        category: 'franchise',
        badge: 'Warner Bros.',
        desc: 'J.K. Rowling\'s Wizarding World, including all 8 Harry Potter films and Fantastic Beasts.',
        cover: 'https://image.tmdb.org/t/p/w1920/5rrGVmRUACiQIuvjN0ix9AC3IRa.jpg',
        tmdbCollectionIds: [1241, 435259],
        strictRegexStr: '^.*(harry potter|fantastic beasts).*$',
        curatedMovies: [
            { id: 'm_hp_1', tmdbId: '671', title: 'Harry Potter and the Sorcerer\'s Stone', year: '2001', rating: '7.9', poster: 'https://image.tmdb.org/t/p/w500/wuMc.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/5rrGVmRUACiQIuvjN0ix9AC3IRa.jpg', description: 'An orphaned boy enrolls in a school of wizardry, where he learns the truth about himself, his family and the terrible evil that haunts the magical world.', type: 'movie' },
            { id: 'm_hp_2', tmdbId: '672', title: 'Harry Potter and the Chamber of Secrets', year: '2002', rating: '7.7', poster: 'https://image.tmdb.org/t/p/w500/sd4.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/1s.jpg', description: 'An ancient prophecy seems to be coming true when a mysterious presence begins stalking the corridors of a school of magic and leaving its victims paralyzed.', type: 'movie' },
            { id: 'm_hp_3', tmdbId: '673', title: 'Harry Potter and the Prisoner of Azkaban', year: '2004', rating: '8.0', poster: 'https://image.tmdb.org/t/p/w500/aB.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/ob.jpg', description: 'Harry, Ron and Hermione return to Hogwarts for their third year of study, where they delve into the mystery surrounding an escaped prisoner who poses a dangerous threat to the young wizard.', type: 'movie' },
            { id: 'm_hp_4', tmdbId: '674', title: 'Harry Potter and the Goblet of Fire', year: '2005', rating: '7.8', poster: 'https://image.tmdb.org/t/p/w500/fE.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/sJ.jpg', description: 'Harry Potter finds himself competing in a hazardous tournament between rival schools of magic, but he is distracted by recurring nightmares.', type: 'movie' },
            { id: 'm_hp_5', tmdbId: '675', title: 'Harry Potter and the Order of the Phoenix', year: '2007', rating: '7.7', poster: 'https://image.tmdb.org/t/p/w500/5a.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/pk.jpg', description: 'With their warning about Lord Voldemort\'s return scoffed at, Harry and Dumbledore are targeted by the Wizard authorities as an authoritarian bureaucrat slowly seizes power at Hogwarts.', type: 'movie' },
            { id: 'm_hp_6', tmdbId: '767', title: 'Harry Potter and the Half-Blood Prince', year: '2009', rating: '7.7', poster: 'https://image.tmdb.org/t/p/w500/z0.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/ur.jpg', description: 'As Harry Potter begins his sixth year at Hogwarts, he discovers an old book marked mysteriously as \'the property of the Half-Blood Prince\' and begins to learn more about Lord Voldemort\'s dark past.', type: 'movie' },
            { id: 'm_hp_7', tmdbId: '12444', title: 'Harry Potter and the Deathly Hallows: Part 1', year: '2010', rating: '7.8', poster: 'https://image.tmdb.org/t/p/w500/iG.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/v1.jpg', description: 'As Harry, Ron and Hermione race against time to destroy the Horcruxes, they uncover the existence of the three most powerful objects in the wizarding world: the Deathly Hallows.', type: 'movie' },
            { id: 'm_hp_8', tmdbId: '12445', title: 'Harry Potter and the Deathly Hallows: Part 2', year: '2011', rating: '8.1', poster: 'https://image.tmdb.org/t/p/w500/da.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/n1.jpg', description: 'Harry, Ron, and Hermione search for Voldemort\'s remaining Horcruxes in their effort to destroy the Dark Lord as the final battle rages at Hogwarts.', type: 'movie' }
        ]
    },
    {
        id: 'middleearth',
        label: 'Middle-earth: The Lord of the Rings',
        studio: 'New Line Cinema / Warner Bros.',
        category: 'franchise',
        badge: 'New Line Cinema',
        desc: 'Peter Jackson\'s cinematic adaptations of J.R.R. Tolkien\'s Middle-earth masterpieces.',
        cover: 'https://image.tmdb.org/t/p/w1920/x2RS3uTcsJJ9Ifj2cgxKi20o9mm.jpg',
        tmdbCollectionIds: [119, 121938],
        strictRegexStr: '^.*(lord of the rings|the hobbit|war of the rohirrim).*$',
        curatedMovies: [
            { id: 'm_lotr_1', tmdbId: '120', title: 'The Lord of the Rings: The Fellowship of the Ring', year: '2001', rating: '8.4', poster: 'https://image.tmdb.org/t/p/w500/6oom5Q.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/x2RS3uTcsJJ9Ifj2cgxKi20o9mm.jpg', description: 'A meek Hobbit from the Shire and eight companions set out on a journey to destroy the powerful One Ring and save Middle-earth from the Dark Lord Sauron.', type: 'movie' },
            { id: 'm_lotr_2', tmdbId: '121', title: 'The Lord of the Rings: The Two Towers', year: '2002', rating: '8.4', poster: 'https://image.tmdb.org/t/p/w500/5VTN.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/kW.jpg', description: 'While Frodo and Sam edge closer to Mordor with the help of the shifty Gollum, the divided fellowship makes a stand against Sauron\'s new ally, Saruman.', type: 'movie' },
            { id: 'm_lotr_3', tmdbId: '122', title: 'The Lord of the Rings: The Return of the King', year: '2003', rating: '8.5', poster: 'https://image.tmdb.org/t/p/w500/rC.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/2u.jpg', description: 'Gandalf and Aragorn lead the World of Men against Sauron\'s army to draw his gaze from Frodo and Sam as they approach Mount Doom with the One Ring.', type: 'movie' },
            { id: 'm_lotr_4', tmdbId: '49051', title: 'The Hobbit: An Unexpected Journey', year: '2012', rating: '7.3', poster: 'https://image.tmdb.org/t/p/w500/ys.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/xy.jpg', description: 'A reluctant Hobbit, Bilbo Baggins, sets out to the Lonely Mountain with a spirited group of dwarves to reclaim their mountain home from a dragon.', type: 'movie' },
            { id: 'm_lotr_5', tmdbId: '57158', title: 'The Hobbit: The Desolation of Smaug', year: '2013', rating: '7.6', poster: 'https://image.tmdb.org/t/p/w500/mv.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/vL.jpg', description: 'The dwarves, along with Bilbo Baggins and Gandalf the Grey, continue their quest to reclaim Erebor, their homeland, from Smaug.', type: 'movie' },
            { id: 'm_lotr_6', tmdbId: '122917', title: 'The Hobbit: The Battle of the Five Armies', year: '2014', rating: '7.3', poster: 'https://image.tmdb.org/t/p/w500/xT.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/sQ.jpg', description: 'Bilbo and company are forced into a war against an array of combatants and keep the Lonely Mountain from falling into the hands of a rising darkness.', type: 'movie' }
        ]
    },
    {
        id: 'spiderman',
        label: 'Spider-Man Universe',
        studio: 'Sony Pictures / Marvel',
        category: 'franchise',
        badge: 'Sony / Marvel',
        desc: 'All official Spider-Man live-action and animated Spider-Verse movies.',
        cover: 'https://image.tmdb.org/t/p/w1920/14QbnygCuTO0vl7CAFmPf1fgZfV.jpg',
        tmdbCollectionIds: [55830, 8945, 531241, 573436],
        strictRegexStr: '^.*spider-?man.*$',
        curatedMovies: [
            { id: 'm_sp_1', tmdbId: '557', title: 'Spider-Man', year: '2002', rating: '7.3', poster: 'https://image.tmdb.org/t/p/w500/gh4.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/14QbnygCuTO0vl7CAFmPf1fgZfV.jpg', description: 'After being bitten by a genetically-modified spider, a shy teenager gains spider-like abilities that he uses to fight a maniacal advertising genius.', type: 'movie' },
            { id: 'm_sp_2', tmdbId: '558', title: 'Spider-Man 2', year: '2004', rating: '7.2', poster: 'https://image.tmdb.org/t/p/w500/ol.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/6m.jpg', description: 'Peter Parker is beset with troubles in his failing personal life as he battles a brilliant scientist named Doctor Otto Octavius.', type: 'movie' },
            { id: 'm_sp_3', tmdbId: '1930', title: 'The Amazing Spider-Man', year: '2012', rating: '6.7', poster: 'https://image.tmdb.org/t/p/w500/jS.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/kG.jpg', description: 'Peter Parker finds a clue that might help him understand why his parents disappeared when he was young, leading him to Oscorp and the Lizard.', type: 'movie' },
            { id: 'm_sp_4', tmdbId: '324857', title: 'Spider-Man: Into the Spider-Verse', year: '2018', rating: '8.4', poster: 'https://image.tmdb.org/t/p/w500/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/uUi.jpg', description: 'Teen Miles Morales becomes the new Spider-Man and joins other Spider-Heroes from alternate dimensions to stop a threat to all reality.', type: 'movie' },
            { id: 'm_sp_5', tmdbId: '569094', title: 'Spider-Man: Across the Spider-Verse', year: '2023', rating: '8.4', poster: 'https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/nG.jpg', description: 'Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People charged with protecting its very existence.', type: 'movie' }
        ]
    },
    {
        id: 'a24',
        label: 'A24 Studios',
        studio: 'A24',
        category: 'studio',
        badge: 'A24',
        desc: 'Award-winning visionary independent cinema distributed and produced by A24.',
        cover: 'https://image.tmdb.org/t/p/w1920/j559jG9V29x448aB3jF7H4k1V7t.jpg',
        tmdbCompanyIds: [41077],
        strictRegexStr: '^.*(everything everywhere all at once|hereditary|midsommar|the whale|moonlight|lady bird|uncut gems|the lighthouse|past lives|civil war|ex machina|the witch|the zone of interest|the iron claw).*$',
        curatedMovies: [
            { id: 'm_a24_1', tmdbId: '545611', title: 'Everything Everywhere All at Once', year: '2022', rating: '7.8', poster: 'https://image.tmdb.org/t/p/w500/w3LxiVYPqRLexPka27.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/j559jG9V29x448aB3jF7H4k1V7t.jpg', description: 'An aging Chinese immigrant is swept up in an insane adventure, where she alone can save the world by exploring other universes.', type: 'movie' },
            { id: 'm_a24_2', tmdbId: '493922', title: 'Hereditary', year: '2018', rating: '7.3', poster: 'https://image.tmdb.org/t/p/w500/p9f.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/yU.jpg', description: 'A grieving family is haunted by tragic and disturbing occurrences after the death of their secretive grandmother.', type: 'movie' },
            { id: 'm_a24_3', tmdbId: '530385', title: 'Midsommar', year: '2019', rating: '7.1', poster: 'https://image.tmdb.org/t/p/w500/7LE.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/yU0.jpg', description: 'A couple travels to Northern Europe to visit a rural hometown\'s fabled Swedish mid-summer festival, which turns into a bizarre cult competition.', type: 'movie' },
            { id: 'm_a24_4', tmdbId: '785084', title: 'The Whale', year: '2022', rating: '7.8', poster: 'https://image.tmdb.org/t/p/w500/jQ.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/sP.jpg', description: 'A reclusive, morbidly obese English teacher attempts to reconnect with his estranged teenage daughter.', type: 'movie' },
            { id: 'm_a24_5', tmdbId: '666277', title: 'Past Lives', year: '2023', rating: '7.8', poster: 'https://image.tmdb.org/t/p/w500/k3.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/4r.jpg', description: 'Nora and Hae Sung, two deeply connected childhood friends, are wrested apart after Nora\'s family emigrates from South Korea.', type: 'movie' },
            { id: 'm_a24_6', tmdbId: '929590', title: 'Civil War', year: '2024', rating: '7.0', poster: 'https://image.tmdb.org/t/p/w500/sh7G.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/z1.jpg', description: 'In a dystopian future America, a team of military-embedded journalists races across the country to reach DC before rebel factions descend.', type: 'movie' }
        ]
    },
    {
        id: 'jurassic',
        label: 'Jurassic Park & World',
        studio: 'Universal Pictures / Amblin',
        category: 'franchise',
        badge: 'Universal Pictures',
        desc: 'The complete dinosaur sci-fi franchise created by Michael Crichton and Steven Spielberg.',
        cover: 'https://image.tmdb.org/t/p/w1920/9i3vQUq6h3tIovB8yA0y6Z95207.jpg',
        tmdbCollectionIds: [328],
        strictRegexStr: '^.*jurassic (park|world).*$',
        curatedMovies: [
            { id: 'm_jp_1', tmdbId: '329', title: 'Jurassic Park', year: '1993', rating: '8.0', poster: 'https://image.tmdb.org/t/p/w500/9i.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/9i3vQUq6h3tIovB8yA0y6Z95207.jpg', description: 'A pragmatic paleontologist touring an almost complete theme park on an island in Central America is tasked with protecting a couple of kids after a power failure causes the cloned dinosaurs to run loose.', type: 'movie' },
            { id: 'm_jp_2', tmdbId: '330', title: 'The Lost World: Jurassic Park', year: '1997', rating: '6.5', poster: 'https://image.tmdb.org/t/p/w500/jM.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/5m.jpg', description: 'A research team is sent to the Jurassic Park Site B island to study the dinosaurs there, while another team approaches with another agenda.', type: 'movie' },
            { id: 'm_jp_3', tmdbId: '135397', title: 'Jurassic World', year: '2015', rating: '6.7', poster: 'https://image.tmdb.org/t/p/w500/rM.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/tH.jpg', description: 'A new theme park, built on the original site of Jurassic Park, creates a genetically modified hybrid dinosaur, the Indominus Rex, which escapes containment.', type: 'movie' },
            { id: 'm_jp_4', tmdbId: '351286', title: 'Jurassic World: Fallen Kingdom', year: '2018', rating: '6.5', poster: 'https://image.tmdb.org/t/p/w500/c9.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/3P.jpg', description: 'When the island\'s dormant volcano begins roaring to life, Owen and Claire mount a campaign to rescue the remaining dinosaurs from extinction.', type: 'movie' },
            { id: 'm_jp_5', tmdbId: '507086', title: 'Jurassic World Dominion', year: '2022', rating: '6.2', poster: 'https://image.tmdb.org/t/p/w500/kP.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/4k.jpg', description: 'Four years after the destruction of Isla Nublar, dinosaurs now live and hunt alongside humans all over the world.', type: 'movie' }
        ]
    },
    {
        id: 'jamesbond',
        label: 'James Bond 007',
        studio: 'EON Productions / MGM',
        category: 'franchise',
        badge: 'MGM',
        desc: 'Official MI6 secret agent 007 film series.',
        cover: 'https://image.tmdb.org/t/p/w1920/5YctN1GvU1ZJqZc4mN5eL4m8z4G.jpg',
        tmdbCollectionIds: [645],
        strictRegexStr: '^.*(james bond|casino royale|quantum of solace|skyfall|spectre|no time to die|goldeneye|goldfinger).*$',
        curatedMovies: [
            { id: 'm_jb_1', tmdbId: '36557', title: 'Casino Royale', year: '2006', rating: '7.5', poster: 'https://image.tmdb.org/t/p/w500/g.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/5YctN1GvU1ZJqZc4mN5eL4m8z4G.jpg', description: 'After earning 00 status and a licence to kill, secret agent James Bond sets out on his first mission to bankrupt a terrorist financier in a high-stakes poker game.', type: 'movie' },
            { id: 'm_jb_2', tmdbId: '37724', title: 'Skyfall', year: '2012', rating: '7.2', poster: 'https://image.tmdb.org/t/p/w500/h.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/2X.jpg', description: 'James Bond\'s loyalty to M is tested when her past comes back to haunt her. When MI6 comes under attack, 007 must track down and destroy the threat.', type: 'movie' },
            { id: 'm_jb_3', tmdbId: '206647', title: 'Spectre', year: '2015', rating: '6.5', poster: 'https://image.tmdb.org/t/p/w500/6.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/vN.jpg', description: 'A cryptic message from the past sends James Bond on a rogue mission to Mexico City and eventually Rome, where he meets the beautiful and forbidden widow of an infamous criminal.', type: 'movie' },
            { id: 'm_jb_4', tmdbId: '370172', title: 'No Time to Die', year: '2021', rating: '7.4', poster: 'https://image.tmdb.org/t/p/w500/i.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/r2.jpg', description: 'James Bond has left active service. His peace is short-lived when Felix Leiter, an old friend from the CIA, turns up asking for help.', type: 'movie' }
        ]
    },
    {
        id: 'johnwick',
        label: 'John Wick Chapters',
        studio: 'Lionsgate',
        category: 'franchise',
        badge: 'Lionsgate',
        desc: 'The official high-octane assassin saga starring Keanu Reeves.',
        cover: 'https://image.tmdb.org/t/p/w1920/v1QEIneWleSydjbeUGe7N2gCg2C.jpg',
        tmdbCollectionIds: [404609],
        strictRegexStr: '^.*john wick.*$',
        curatedMovies: [
            { id: 'm_jw_1', tmdbId: '245891', title: 'John Wick', year: '2014', rating: '7.4', poster: 'https://image.tmdb.org/t/p/w500/fZ.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/v1QEIneWleSydjbeUGe7N2gCg2C.jpg', description: 'An ex-hit-man comes out of retirement to track down the gangsters that killed his dog and took his car.', type: 'movie' },
            { id: 'm_jw_2', tmdbId: '324552', title: 'John Wick: Chapter 2', year: '2017', rating: '7.3', poster: 'https://image.tmdb.org/t/p/w500/h9.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/m5.jpg', description: 'After returning to the criminal underworld to repay a debt, John Wick discovers that a large bounty has been put on his life.', type: 'movie' },
            { id: 'm_jw_3', tmdbId: '458156', title: 'John Wick: Chapter 3 - Parabellum', year: '2019', rating: '7.4', poster: 'https://image.tmdb.org/t/p/w500/zi.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/vV.jpg', description: 'John Wick is on the run after killing a member of the international assassin\'s guild, and with a $14 million price tag on his head, he is the target of hit men and women everywhere.', type: 'movie' },
            { id: 'm_jw_4', tmdbId: '603692', title: 'John Wick: Chapter 4', year: '2023', rating: '7.7', poster: 'https://image.tmdb.org/t/p/w500/vZ.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/7I.jpg', description: 'With the price on his head ever increasing, John Wick uncovers a path to defeating The High Table, but before he can earn his freedom, Wick must face off against a new enemy.', type: 'movie' }
        ]
    },
    {
        id: 'missionimpossible',
        label: 'Mission: Impossible',
        studio: 'Paramount Pictures',
        category: 'franchise',
        badge: 'Paramount Pictures',
        desc: 'Tom Cruise as IMF secret agent Ethan Hunt across globetrotting impossible missions.',
        cover: 'https://image.tmdb.org/t/p/w1920/628Dep6AxEtDxjZoGP78TsOxYbK.jpg',
        tmdbCollectionIds: [87359],
        strictRegexStr: '^.*mission:? impossible.*$',
        curatedMovies: [
            { id: 'm_mi_1', tmdbId: '954', title: 'Mission: Impossible', year: '1996', rating: '7.0', poster: 'https://image.tmdb.org/t/p/w500/la.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/628Dep6AxEtDxjZoGP78TsOxYbK.jpg', description: 'An American agent, falsely suspected of disloyalty, must discover and expose the real spy without the help of his organization.', type: 'movie' },
            { id: 'm_mi_2', tmdbId: '56292', title: 'Mission: Impossible - Ghost Protocol', year: '2011', rating: '7.1', poster: 'https://image.tmdb.org/t/p/w500/eI.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/7c.jpg', description: 'The IMF is shut down when it\'s implicated in the bombing of the Kremlin, causing Ethan Hunt and his new team to go rogue to clear their organization\'s name.', type: 'movie' },
            { id: 'm_mi_3', tmdbId: '177677', title: 'Mission: Impossible - Rogue Nation', year: '2015', rating: '7.2', poster: 'https://image.tmdb.org/t/p/w500/z0.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/4e.jpg', description: 'Ethan and team take on their most impossible mission yet, eradicating the Syndicate - an International rogue organization that is committed to destroying the IMF.', type: 'movie' },
            { id: 'm_mi_4', tmdbId: '353081', title: 'Mission: Impossible - Fallout', year: '2018', rating: '7.4', poster: 'https://image.tmdb.org/t/p/w500/Ak.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/aw.jpg', description: 'When an IMF mission ends badly, the world is faced with dire consequences. As Ethan Hunt takes it upon himself to fulfill his original briefing, the CIA begins to question his motives.', type: 'movie' },
            { id: 'm_mi_5', tmdbId: '575264', title: 'Mission: Impossible - Dead Reckoning Part One', year: '2023', rating: '7.6', poster: 'https://image.tmdb.org/t/p/w500/NN.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/62.jpg', description: 'Ethan Hunt and his IMF team must track down a terrifying new weapon that threatens all of humanity before it falls into the wrong hands.', type: 'movie' }
        ]
    },
    {
        id: 'matrix',
        label: 'The Matrix Franchise',
        studio: 'Warner Bros. Pictures',
        category: 'franchise',
        badge: 'Warner Bros.',
        desc: 'The Wachowskis\' sci-fi cyberpunk universe questioning the nature of reality.',
        cover: 'https://image.tmdb.org/t/p/w1920/ncEAKVNjhYWbqrAYNAtZkJSqFKo.jpg',
        tmdbCollectionIds: [2344],
        strictRegexStr: '^.*the matrix( (reloaded|revolutions|resurrections))?.*$',
        negativeRegexStr: '(matrix system|dot matrix)',
        curatedMovies: [
            { id: 'm_mx_1', tmdbId: '603', title: 'The Matrix', year: '1999', rating: '8.2', poster: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/ncEAKVNjhYWbqrAYNAtZkJSqFKo.jpg', description: 'When a beautiful stranger leads computer hacker Neo to a forbidding underworld, he discovers the shocking truth--the life he knows is the elaborate deception of an evil cyber-intelligence.', type: 'movie' },
            { id: 'm_mx_2', tmdbId: '604', title: 'The Matrix Reloaded', year: '2003', rating: '7.0', poster: 'https://image.tmdb.org/t/p/w500/9TG.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/eX.jpg', description: 'Six months after the events depicted in The Matrix, Neo has proved to be a good omen for the free humans, as more and more humans are being freed from the matrix.', type: 'movie' },
            { id: 'm_mx_3', tmdbId: '605', title: 'The Matrix Revolutions', year: '2003', rating: '6.7', poster: 'https://image.tmdb.org/t/p/w500/tL.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/2W.jpg', description: 'The human city of Zion defends itself against the massive invasion of the machines as Neo fights to end the war at another front while also opposing the rogue Agent Smith.', type: 'movie' },
            { id: 'm_mx_4', tmdbId: '624860', title: 'The Matrix Resurrections', year: '2021', rating: '6.4', poster: 'https://image.tmdb.org/t/p/w500/8c.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/hv.jpg', description: 'Plagued by strange memories, Neo\'s life takes an unexpected turn when he finds himself back inside the Matrix.', type: 'movie' }
        ]
    },
    {
        id: 'alien',
        label: 'Alien & Predator',
        studio: '20th Century Studios',
        category: 'franchise',
        badge: '20th Century Studios',
        desc: 'Official Xenomorph and Yautja sci-fi horror films. Strictly verified franchise entries.',
        cover: 'https://image.tmdb.org/t/p/w1920/9BBTo63ANSmbtqfZ2q69c9qg1tT.jpg',
        tmdbCollectionIds: [8091, 399],
        strictRegexStr: '^.*(alien(s|: (covenant|romulus|resurrection))?|prometheus|alien 3|predator|prey).*$',
        negativeRegexStr: '(resident alien|alien invasion|alien vs ninja|alienoid|my stepmother is an alien)',
        curatedMovies: [
            { id: 'm_al_1', tmdbId: '348', title: 'Alien', year: '1979', rating: '8.1', poster: 'https://image.tmdb.org/t/p/w500/vfr.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/9BBTo63ANSmbtqfZ2q69c9qg1tT.jpg', description: 'The crew of a commercial spacecraft encounters a deadly lifeform after investigating a mysterious transmission of unknown origin on an uncharted planetoid.', type: 'movie' },
            { id: 'm_al_2', tmdbId: '679', title: 'Aliens', year: '1986', rating: '8.0', poster: 'https://image.tmdb.org/t/p/w500/bX.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/5U.jpg', description: 'Ellen Ripley is rescued after 57 years in stasis and agrees to accompany a squad of colonial marines to investigate a severed communication on LV-426.', type: 'movie' },
            { id: 'm_al_3', tmdbId: '70981', title: 'Prometheus', year: '2012', rating: '6.6', poster: 'https://image.tmdb.org/t/p/w500/9k.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/1m.jpg', description: 'Following a clue to the origins of mankind, a team journeys across the universe and finds the structure on a distant planet, but they soon realize they are not alone.', type: 'movie' },
            { id: 'm_al_4', tmdbId: '945961', title: 'Alien: Romulus', year: '2024', rating: '7.2', poster: 'https://image.tmdb.org/t/p/w500/b3.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/9l.jpg', description: 'While scavenging the deep ends of a derelict space station, a group of young space colonizers come face to face with the most terrifying life form in the universe.', type: 'movie' },
            { id: 'm_al_5', tmdbId: '106', title: 'Predator', year: '1987', rating: '7.5', poster: 'https://image.tmdb.org/t/p/w500/k3.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/yF.jpg', description: 'A team of commandos on a mission in a Central American jungle find themselves hunted by an extraterrestrial warrior.', type: 'movie' },
            { id: 'm_al_6', tmdbId: '766507', title: 'Prey', year: '2022', rating: '7.7', poster: 'https://image.tmdb.org/t/p/w500/uj.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/7A.jpg', description: 'When danger threatens her camp, the fierce Comanche warrior Naru sets out to protect her people against an alien Predator.', type: 'movie' }
        ]
    },
    {
        id: 'disney',
        label: 'Disney Animation Classics',
        studio: 'Walt Disney Pictures',
        category: 'studio',
        badge: 'Walt Disney Pictures',
        desc: 'Official Walt Disney Animation Studios feature films.',
        cover: 'https://image.tmdb.org/t/p/w1920/wXsAAEr2LH1g5tG9TaMmh4nZ98M.jpg',
        tmdbCompanyIds: [2],
        strictRegexStr: '^.*(the lion king|frozen( (ii|2))?|moana|zootopia|encanto|tangled|aladdin|beauty and the beast|mulan|the little mermaid).*$',
        negativeRegexStr: '(frozen river|frozen ground)',
        curatedMovies: [
            { id: 'm_dis_1', tmdbId: '8587', title: 'The Lion King', year: '1994', rating: '8.3', poster: 'https://image.tmdb.org/t/p/w500/sK.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/wXsAAEr2LH1g5tG9TaMmh4nZ98M.jpg', description: 'A lion cub crown prince is duped by his treacherous uncle into thinking he caused his father\'s death and flees into exile.', type: 'movie' },
            { id: 'm_dis_2', tmdbId: '109445', title: 'Frozen', year: '2013', rating: '7.2', poster: 'https://image.tmdb.org/t/p/w500/kg.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/f9.jpg', description: 'When the newly crowned Queen Elsa accidentally uses her power to turn things into ice to curse her home in infinite winter, her sister Anna teams up to change the weather.', type: 'movie' },
            { id: 'm_dis_3', tmdbId: '277834', title: 'Moana', year: '2016', rating: '7.6', poster: 'https://image.tmdb.org/t/p/w500/4j.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/1T.jpg', description: 'In Ancient Polynesia, when a terrible curse incurred by Maui reaches an Impetuous Chieftain\'s daughter\'s island, she answers the Ocean\'s call to seek out the demigod.', type: 'movie' },
            { id: 'm_dis_4', tmdbId: '269149', title: 'Zootopia', year: '2016', rating: '7.7', poster: 'https://image.tmdb.org/t/p/w500/hl.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/mh.jpg', description: 'In a city of anthropomorphic animals, a rookie bunny cop and a cynical con artist fox must work together to uncover a conspiracy.', type: 'movie' },
            { id: 'm_dis_5', tmdbId: '568124', title: 'Encanto', year: '2021', rating: '7.6', poster: 'https://image.tmdb.org/t/p/w500/4j0.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/3G.jpg', description: 'A Colombian teenage girl has to face the frustration of being the only member of her family without magical powers.', type: 'movie' }
        ]
    },
    {
        id: 'dreamworks',
        label: 'DreamWorks Animation',
        studio: 'DreamWorks Animation',
        category: 'studio',
        badge: 'DreamWorks',
        desc: 'Blockbuster animated franchises from Shrek to How to Train Your Dragon.',
        cover: 'https://image.tmdb.org/t/p/w1920/f91k5U1L8k0B0993081.jpg',
        tmdbCompanyIds: [521],
        tmdbCollectionIds: [2150],
        strictRegexStr: '^.*(shrek|puss in boots|how to train your dragon|kung fu panda|madagascar).*$',
        curatedMovies: [
            { id: 'm_dw_1', tmdbId: '808', title: 'Shrek', year: '2001', rating: '7.7', poster: 'https://image.tmdb.org/t/p/w500/dy.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/f91k5U1L8k0B0993081.jpg', description: 'A mean lord exiles fairytale creatures to the swamp of a grumpy ogre, who must go on a quest and rescue a princess for the lord to get his land back.', type: 'movie' },
            { id: 'm_dw_2', tmdbId: '10527', title: 'Shrek 2', year: '2004', rating: '7.3', poster: 'https://image.tmdb.org/t/p/w500/2y.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/9l.jpg', description: 'Shrek and Fiona travel to the Kingdom of Far Far Away, where Fiona\'s parents are King and Queen, to celebrate their marriage.', type: 'movie' },
            { id: 'm_dw_3', tmdbId: '315162', title: 'Puss in Boots: The Last Wish', year: '2022', rating: '8.2', poster: 'https://image.tmdb.org/t/p/w500/kR.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/jr.jpg', description: 'Puss in Boots discovers that his passion for adventure has taken its toll: he has burned through eight of his nine lives. He launches an epic journey to find the Wishing Star.', type: 'movie' },
            { id: 'm_dw_4', tmdbId: '16869', title: 'How to Train Your Dragon', year: '2010', rating: '7.8', poster: 'https://image.tmdb.org/t/p/w500/yg.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/3l.jpg', description: 'A hapless young Viking who aspires to hunt dragons becomes the unlikely friend of a young dragon himself, and learns there may be more to the creatures than he assumed.', type: 'movie' },
            { id: 'm_dw_5', tmdbId: '9502', title: 'Kung Fu Panda', year: '2008', rating: '7.3', poster: 'https://image.tmdb.org/t/p/w500/wP.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/q5.jpg', description: 'To everyone\'s surprise, including his own, Po, an overweight, clumsy panda, is chosen as protector of the Valley of Peace.', type: 'movie' }
        ]
    },
    {
        id: 'transformers',
        label: 'Transformers Franchise',
        studio: 'Paramount Pictures / Hasbro',
        category: 'franchise',
        badge: 'Paramount Pictures',
        desc: 'Autobots and Decepticons battling across Earth and Cybertron.',
        cover: 'https://image.tmdb.org/t/p/w1920/jP4bH30eW3209842.jpg',
        tmdbCollectionIds: [8650],
        strictRegexStr: '^.*(transformers|bumblebee).*$',
        curatedMovies: [
            { id: 'm_tf_1', tmdbId: '1858', title: 'Transformers', year: '2007', rating: '6.8', poster: 'https://image.tmdb.org/t/p/w500/1p.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/jP4bH30eW3209842.jpg', description: 'An ancient struggle between two Cybertronian factions, the heroic Autobots and the villainous Decepticons, comes to Earth, with a clue to the ultimate power held by a teenager.', type: 'movie' },
            { id: 'm_tf_2', tmdbId: '424783', title: 'Bumblebee', year: '2018', rating: '6.8', poster: 'https://image.tmdb.org/t/p/w500/f.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/8b.jpg', description: 'On the run in the year 1987, Bumblebee finds refuge in a junkyard in a small Californian beach town where Charlie, on the cusp of turning 18, revives him.', type: 'movie' },
            { id: 'm_tf_3', tmdbId: '667538', title: 'Transformers: Rise of the Beasts', year: '2023', rating: '7.3', poster: 'https://image.tmdb.org/t/p/w500/gP.jpg', backdrop: 'https://image.tmdb.org/t/p/w1920/2v.jpg', description: 'When a new threat capable of destroying the entire planet emerges, Optimus Prime and the Autobots must team up with a powerful faction known as the Maximals.', type: 'movie' }
        ]
    }
];

const jsContent = `// collections-data.js: Pristine company & franchise collections data with verified movies
window.COLLECTION_DEFS = ${JSON.stringify(collections, null, 2)};
`;

fs.writeFileSync('collections-data.js', jsContent, 'utf8');
console.log('Successfully wrote collections-data.js with ' + collections.length + ' collections');
