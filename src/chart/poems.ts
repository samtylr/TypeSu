/**
 * Poem pool. Every poem here was published before 1929 and is in the public domain.
 * Add more by appending to POEMS; text is normalised at load time.
 */
export interface Poem {
  title: string;
  author: string;
  text: string;
}

export const POEMS: Poem[] = [
  {
    title: 'Ozymandias',
    author: 'Percy Bysshe Shelley, 1818',
    text: `I met a traveller from an antique land,
Who said, Two vast and trunkless legs of stone
Stand in the desert. Near them, on the sand,
Half sunk a shattered visage lies, whose frown,
And wrinkled lip, and sneer of cold command,
Tell that its sculptor well those passions read
Which yet survive, stamped on these lifeless things,
The hand that mocked them, and the heart that fed;
And on the pedestal, these words appear:
My name is Ozymandias, King of Kings;
Look on my Works, ye Mighty, and despair!
Nothing beside remains. Round the decay
Of that colossal Wreck, boundless and bare
The lone and level sands stretch far away.`,
  },
  {
    title: 'Hope is the thing with feathers',
    author: 'Emily Dickinson, 1891',
    text: `Hope is the thing with feathers
That perches in the soul
And sings the tune without the words
And never stops at all
And sweetest in the Gale is heard
And sore must be the storm
That could abash the little Bird
That kept so many warm
I have heard it in the chillest land
And on the strangest Sea
Yet never in Extremity
It asked a crumb of me.`,
  },
  {
    title: 'The Road Not Taken',
    author: 'Robert Frost, 1916',
    text: `Two roads diverged in a yellow wood,
And sorry I could not travel both
And be one traveler, long I stood
And looked down one as far as I could
To where it bent in the undergrowth;
Then took the other, as just as fair,
And having perhaps the better claim,
Because it was grassy and wanted wear;
Though as for that the passing there
Had worn them really about the same,
And both that morning equally lay
In leaves no step had trodden black.
Oh, I kept the first for another day!
Yet knowing how way leads on to way,
I doubted if I should ever come back.
I shall be telling this with a sigh
Somewhere ages and ages hence:
Two roads diverged in a wood, and I,
I took the one less traveled by,
And that has made all the difference.`,
  },
  {
    title: 'I Wandered Lonely as a Cloud',
    author: 'William Wordsworth, 1807',
    text: `I wandered lonely as a cloud
That floats on high over vales and hills,
When all at once I saw a crowd,
A host, of golden daffodils;
Beside the lake, beneath the trees,
Fluttering and dancing in the breeze.
Continuous as the stars that shine
And twinkle on the milky way,
They stretched in never ending line
Along the margin of a bay:
Ten thousand saw I at a glance,
Tossing their heads in sprightly dance.`,
  },
  {
    title: 'The Tyger',
    author: 'William Blake, 1794',
    text: `Tyger Tyger, burning bright,
In the forests of the night;
What immortal hand or eye,
Could frame thy fearful symmetry?
In what distant deeps or skies
Burnt the fire of thine eyes?
On what wings dare he aspire?
What the hand, dare seize the fire?`,
  },
  {
    title: 'Who Has Seen the Wind?',
    author: 'Christina Rossetti, 1872',
    text: `Who has seen the wind?
Neither I nor you:
But when the leaves hang trembling,
The wind is passing through.
Who has seen the wind?
Neither you nor I:
But when the trees bow down their heads,
The wind is passing by.`,
  },
  {
    title: 'My Shadow',
    author: 'Robert Louis Stevenson, 1885',
    text: `I have a little shadow that goes in and out with me,
And what can be the use of him is more than I can see.
He is very, very like me from the heels up to the head;
And I see him jump before me, when I jump into my bed.`,
  },
];

/** A poem reduced to typeable words, grouped by line. */
export interface PreparedPoem {
  title: string;
  author: string;
  lines: string[][];
}

/** Lowercase, keep a–z only, split into lines of words. */
export function preparePoem(poem: Poem): PreparedPoem {
  const lines = poem.text
    .split('\n')
    .map((line) =>
      line
        .toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .split(/\s+/)
        .filter(Boolean),
    )
    .filter((words) => words.length > 0);
  return { title: poem.title, author: poem.author, lines };
}
