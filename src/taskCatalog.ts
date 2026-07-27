export const TASK_CATEGORIES = [
  "Photo",
  "Find",
  "People",
  "Creative",
  "Teamwork",
  "Nature",
  "City",
  "Indoor",
  "Movement",
  "Kindness",
] as const;

export type CatalogCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_SETTINGS = [
  "Anywhere",
  "Indoor",
  "Outdoor",
  "City",
  "School",
  "Office",
  "Party",
] as const;

export type CatalogSetting = (typeof TASK_SETTINGS)[number];

export type CatalogTask = {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: CatalogCategory;
  settings: readonly CatalogSetting[];
  tags: readonly string[];
};

type CatalogTaskSeed = readonly [
  id: string,
  title: string,
  description: string,
  icon: string,
  settings: readonly CatalogSetting[],
];

function defineCategory(
  category: CatalogCategory,
  seeds: readonly CatalogTaskSeed[],
): CatalogTask[] {
  return seeds.map(([id, title, description, icon, settings]) => ({
    id,
    title,
    description,
    icon,
    category,
    settings,
    tags: [
      category.toLowerCase(),
      ...settings.map((setting) => setting.toLowerCase()),
      ...`${title} ${description}`
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .split(/\s+/)
        .filter((word) => word.length > 2),
    ],
  }));
}

const photoTasks = defineCategory("Photo", [
  ["group-selfie", "Group Selfie", "Take one photo with everyone in your group visible.", "Camera", ["Anywhere", "Party", "School", "Office"]],
  ["team-pose", "Team Pose", "Create a fun team pose and photograph it.", "Users", ["Anywhere", "Party", "School", "Office"]],
  ["reflection", "Reflection", "Take a photo of an interesting reflection.", "Glasses", ["Anywhere", "Indoor", "Outdoor", "City"]],
  ["group-shadow", "Group Shadow", "Photograph your group’s shadows together.", "Cloud", ["Outdoor", "City"]],
  ["team-jump", "Team Jump", "Take a safe mid-air team jump photo.", "Triangle", ["Outdoor", "Party"]],
  ["team-wave", "Team Wave", "Take a photo of everyone waving.", "Users", ["Anywhere", "Party", "School", "Office"]],
  ["someone-laughing", "Someone Laughing", "Capture a real laugh from someone in your group.", "Smile", ["Anywhere", "Party"]],
  ["final-group-shot", "Final Group Shot", "Take one strong group photo to finish the game.", "Trophy", ["Anywhere", "Party", "School", "Office"]],
  ["tiny-perspective", "Tiny Perspective", "Use perspective to make one teammate look tiny.", "Camera", ["Anywhere", "Outdoor", "Indoor"]],
  ["giant-perspective", "Giant Perspective", "Use perspective to make one object look enormous.", "Camera", ["Anywhere", "Outdoor", "Indoor"]],
  ["matching-colors", "Matching Colors", "Photograph two things that are nearly the same color.", "Palette", ["Anywhere", "Indoor", "Outdoor"]],
  ["frame-within-frame", "Frame Within a Frame", "Use a doorway, window, or branches to frame your subject.", "Image", ["Anywhere", "Indoor", "Outdoor", "City"]],
  ["symmetry-shot", "Symmetry Shot", "Take a photo with clear left-to-right symmetry.", "Grid3X3", ["Anywhere", "Indoor", "Outdoor", "City"]],
  ["leading-lines", "Leading Lines", "Photograph lines that guide the eye toward a subject.", "Route", ["Anywhere", "Indoor", "Outdoor", "City"]],
  ["color-pop", "Color Pop", "Photograph one bright color standing out from its surroundings.", "Badge", ["Anywhere", "Indoor", "Outdoor"]],
  ["texture-closeup", "Texture Close-Up", "Take a close photo of an interesting texture.", "Gem", ["Anywhere", "Indoor", "Outdoor"]],
  ["look-up-photo", "Look Up Photo", "Photograph an interesting detail above eye level.", "Bird", ["Anywhere", "Indoor", "Outdoor", "City"]],
  ["look-down-photo", "Look Down Photo", "Photograph a detail on the ground that is easy to miss.", "Bug", ["Anywhere", "Indoor", "Outdoor", "City"]],
  ["through-a-window", "Through a Window", "Take a photo through a window without including private spaces.", "Eye", ["Indoor", "City"]],
  ["silhouette-shot", "Silhouette Shot", "Create a clear silhouette using safe available light.", "Cloud", ["Indoor", "Outdoor"]],
  ["same-shape-photo", "Same Shape", "Photograph two unrelated objects with the same shape.", "Circle", ["Anywhere", "Indoor", "Outdoor"]],
  ["before-and-after-pose", "Before and After Pose", "Take two matching poses in two different spots.", "Camera", ["Anywhere", "Party", "School", "Office"]],
  ["team-in-motion", "Team in Motion", "Capture your group walking or moving safely together.", "Users", ["Outdoor", "City", "Party"]],
  ["favorite-find-photo", "Favorite Find", "Photograph your group’s favorite discovery so far.", "Star", ["Anywhere", "Indoor", "Outdoor", "City"]],
  ["album-cover", "Album Cover", "Stage an all-ages group photo that could be an album cover.", "Image", ["Anywhere", "Party", "School", "Office"]],
]);

const findTasks = defineCategory("Find", [
  ["something-red", "Something Red", "Find something red.", "Badge", ["Anywhere", "Indoor", "Outdoor"]],
  ["helpful-sign", "Helpful Sign", "Find a sign that helps people navigate.", "Signpost", ["Outdoor", "City", "School", "Office"]],
  ["interesting-seat", "Interesting Seat", "Find an unusual or inviting place to sit.", "Armchair", ["Anywhere", "Indoor", "Outdoor", "City"]],
  ["water-break", "Water Break", "Find a water bottle, fountain, or drink station.", "Droplets", ["Anywhere", "Indoor", "Outdoor", "School", "Office"]],
  ["something-round", "Something Round", "Find something round that is bigger than your hand.", "Circle", ["Anywhere", "Indoor", "Outdoor"]],
  ["cool-hat", "Cool Hat", "Find an interesting hat without borrowing it.", "HardHat", ["Anywhere", "Indoor", "Party"]],
  ["snack", "Snack", "Find a snack without requiring anyone to buy it.", "Cookie", ["Anywhere", "Indoor", "Party", "School", "Office"]],
  ["wheels", "Wheels", "Find a bike, cart, scooter, or another object with wheels.", "Bike", ["Anywhere", "Indoor", "Outdoor", "City"]],
  ["public-clock", "Clock or Timer", "Find a visible clock, timer, or schedule.", "Clock", ["Anywhere", "Indoor", "Outdoor", "City", "School", "Office"]],
  ["tiny-thing", "Tiny Thing", "Find the smallest interesting object you can see.", "Bug", ["Anywhere", "Indoor", "Outdoor"]],
  ["tall-thing", "Tall Thing", "Find the tallest thing you can see from where you are.", "TreePine", ["Outdoor", "City"]],
  ["trash-can", "Trash Can", "Find a public trash or recycling bin.", "Trash2", ["Anywhere", "Indoor", "Outdoor", "City"]],
  ["food-place", "Food Place", "Find a place that serves or displays food.", "Utensils", ["Indoor", "Outdoor", "City", "Party"]],
  ["drink-place", "Drink Place", "Find a place where people can get a drink.", "CupSoda", ["Indoor", "Outdoor", "City", "Party"]],
  ["something-blue", "Something Blue", "Find something blue.", "Waves", ["Anywhere", "Indoor", "Outdoor"]],
  ["ticket-or-receipt", "Ticket or Receipt", "Find a visible ticket, receipt, or posted price without showing private details.", "Ticket", ["Anywhere", "Indoor", "City"]],
  ["mail-or-message", "Mail or Message", "Find a public mailbox, notice, or message board.", "Mailbox", ["Indoor", "Outdoor", "City", "School", "Office"]],
  ["pattern", "Pattern", "Find a clear repeated pattern.", "Grid3X3", ["Anywhere", "Indoor", "Outdoor", "City"]],
  ["something-shiny", "Something Shiny", "Find something shiny or reflective.", "Gem", ["Anywhere", "Indoor", "Outdoor"]],
  ["sport-or-game", "Sport or Game", "Find sports gear, a board game, or a play area.", "Goal", ["Anywhere", "Indoor", "Outdoor", "School", "Office"]],
  ["transportation", "Transportation", "Find a vehicle, transit sign, or route marker.", "Bus", ["Outdoor", "City"]],
  ["number-7", "Number 7", "Find the number 7 displayed somewhere.", "Hash", ["Anywhere", "Indoor", "Outdoor", "City"]],
  ["something-heavy", "Something Heavy", "Find something that looks heavy without lifting it.", "Truck", ["Anywhere", "Indoor", "Outdoor"]],
  ["something-light", "Something Light", "Find something light, airy, or floating.", "Bird", ["Anywhere", "Indoor", "Outdoor"]],
  ["opposite-colors", "Opposite Colors", "Find two very different colors side by side.", "Palette", ["Anywhere", "Indoor", "Outdoor"]],
]);

const peopleTasks = defineCategory("People", [
  ["team-initials", "Team Initials", "Find or safely arrange your team’s initials.", "Flag", ["Anywhere", "Indoor", "Outdoor", "Party", "School", "Office"]],
  ["matching-shoes", "Matching Shoes", "Find two people in your group wearing similar shoes.", "Shirt", ["Anywhere", "Party", "School", "Office"]],
  ["same-first-letter", "Same First Letter", "Find two teammates whose first names begin with the same letter.", "Hash", ["Anywhere", "Party", "School", "Office"]],
  ["birthday-month-match", "Birthday Month Match", "Find two teammates with birthdays in the same month.", "Star", ["Anywhere", "Party", "School", "Office"]],
  ["team-high-five", "Team High Five", "Get everyone in your group into one high-five.", "HeartHandshake", ["Anywhere", "Party", "School", "Office"]],
  ["favorite-food-match", "Favorite Food Match", "Find two teammates who share a favorite food.", "Pizza", ["Anywhere", "Party", "School", "Office"]],
  ["favorite-color-lineup", "Favorite Color Lineup", "Line up your group by favorite color from light to dark.", "Palette", ["Anywhere", "Party", "School", "Office"]],
  ["two-truths", "Two Quick Truths", "Have one teammate share two simple true facts about themselves.", "Smile", ["Anywhere", "Party", "School", "Office"]],
  ["hidden-talent", "Hidden Talent", "Have a teammate demonstrate a safe, all-ages talent.", "Trophy", ["Anywhere", "Party", "School", "Office"]],
  ["team-motto", "Team Motto", "Create a five-word motto for your group.", "Flag", ["Anywhere", "Party", "School", "Office"]],
  ["shared-hobby", "Shared Hobby", "Find two teammates who enjoy the same hobby.", "Users", ["Anywhere", "Party", "School", "Office"]],
  ["name-rhyme", "Name Rhyme", "Create a friendly rhyme using one teammate’s name.", "Smile", ["Anywhere", "Party", "School"]],
  ["group-height-order", "Height Order", "Line up your group from shortest to tallest.", "Users", ["Anywhere", "Party", "School", "Office"]],
  ["alphabetical-order", "Alphabetical Order", "Line up by first name in alphabetical order.", "List", ["Anywhere", "Party", "School", "Office"]],
  ["same-number", "Same Favorite Number", "Find two teammates who chose the same favorite number.", "Hash", ["Anywhere", "Party", "School", "Office"]],
  ["best-joke", "Best Clean Joke", "Have a teammate tell a short, all-ages joke.", "Smile", ["Anywhere", "Party", "School", "Office"]],
  ["team-cheer", "Team Cheer", "Create a short cheer at a volume appropriate for the setting.", "Trophy", ["Anywhere", "Party", "School", "Office"]],
  ["common-ground", "Three Things in Common", "Find three things everyone in your group has in common.", "Users", ["Anywhere", "Party", "School", "Office"]],
  ["memory-share", "Favorite Memory", "Have one teammate share a favorite positive memory.", "Star", ["Anywhere", "Party", "School", "Office"]],
  ["dream-destination", "Dream Destination", "Find two teammates who would visit the same place.", "Route", ["Anywhere", "Party", "School", "Office"]],
  ["same-snack-choice", "Same Snack Choice", "Find two teammates who would choose the same snack.", "Cookie", ["Anywhere", "Party", "School", "Office"]],
  ["team-nickname", "Team Nickname", "Invent a friendly nickname for your whole group.", "Badge", ["Anywhere", "Party", "School", "Office"]],
  ["one-word-story", "One-Word Story", "Create one sentence with each teammate adding one word.", "Users", ["Anywhere", "Party", "School", "Office"]],
  ["compliment-circle", "Compliment Circle", "Each person gives one sincere compliment to another teammate.", "HeartHandshake", ["Anywhere", "Party", "School", "Office"]],
  ["group-countdown", "Group Countdown", "Count down from ten with each person saying one number.", "Hash", ["Anywhere", "Party", "School", "Office"]],
]);

const creativeTasks = defineCategory("Creative", [
  ["public-art", "Public Art", "Find art, decoration, or a creative display.", "Image", ["Indoor", "Outdoor", "City", "School", "Office"]],
  ["human-letter", "Human Letter", "Use your group to form a recognizable letter.", "Users", ["Anywhere", "Outdoor", "Party", "School"]],
  ["human-shape", "Human Shape", "Use your group to make a simple geometric shape.", "Circle", ["Anywhere", "Outdoor", "Party", "School"]],
  ["tiny-sculpture", "Tiny Sculpture", "Arrange safe loose objects into a tiny temporary sculpture, then put them back.", "Gem", ["Anywhere", "Indoor", "Outdoor", "School", "Office"]],
  ["found-color-wheel", "Found Color Wheel", "Find objects representing at least four colors.", "Palette", ["Anywhere", "Indoor", "Outdoor"]],
  ["five-word-story", "Five-Word Story", "Write or say a complete story using exactly five words.", "List", ["Anywhere", "Party", "School", "Office"]],
  ["sound-effect", "Sound Effect", "Create a group sound effect appropriate for the setting.", "Smile", ["Anywhere", "Party", "School", "Office"]],
  ["living-statue", "Living Statue", "Hold a safe statue pose together for five seconds.", "Landmark", ["Anywhere", "Party", "School", "Office"]],
  ["new-product", "Invent a Product", "Invent a useful product using two nearby objects as inspiration.", "Star", ["Anywhere", "Indoor", "School", "Office"]],
  ["team-logo", "Team Logo", "Sketch a simple team logo on paper or describe it aloud.", "Badge", ["Anywhere", "Indoor", "Party", "School", "Office"]],
  ["movie-title", "Movie Title", "Invent a family-friendly movie title about your current location.", "Image", ["Anywhere", "Party", "School", "Office"]],
  ["weather-report", "Weather Report", "Give a ten-second pretend weather report for your location.", "Umbrella", ["Anywhere", "Outdoor", "Party", "School"]],
  ["museum-label", "Museum Label", "Choose an ordinary object and invent a museum label for it.", "Landmark", ["Anywhere", "Indoor", "School", "Office"]],
  ["new-holiday", "Invent a Holiday", "Invent a cheerful new holiday and one tradition for it.", "Star", ["Anywhere", "Party", "School", "Office"]],
  ["mascot-design", "Design a Mascot", "Choose an animal or object that could represent your team.", "Dog", ["Anywhere", "Party", "School", "Office"]],
  ["rhyming-pair", "Rhyming Pair", "Find or name two nearby things whose names rhyme.", "Smile", ["Anywhere", "Indoor", "Outdoor", "School"]],
  ["color-name", "Invent a Color Name", "Find an unusual color and give it a memorable name.", "Palette", ["Anywhere", "Indoor", "Outdoor"]],
  ["mini-commercial", "Mini Commercial", "Create a ten-second all-ages commercial for an ordinary object.", "Camera", ["Anywhere", "Indoor", "Party", "School", "Office"]],
  ["soundtrack-choice", "Choose a Soundtrack", "Name a song that would fit this moment without playing it.", "Star", ["Anywhere", "Party", "School", "Office"]],
  ["new-road-sign", "Invent a Sign", "Invent a helpful sign that would improve this place.", "Signpost", ["Anywhere", "Indoor", "Outdoor", "City", "School", "Office"]],
  ["superpower-choice", "Choose a Superpower", "Agree on one harmless superpower your team would like.", "Flame", ["Anywhere", "Party", "School", "Office"]],
  ["one-line-poem", "One-Line Poem", "Create a one-line poem inspired by something nearby.", "Flower2", ["Anywhere", "Indoor", "Outdoor", "School"]],
  ["object-backstory", "Object Backstory", "Invent a short, friendly backstory for an ordinary object.", "Clock", ["Anywhere", "Indoor", "School", "Office"]],
  ["imaginary-map", "Imaginary Map", "Describe a fantasy map based on the shapes around you.", "Route", ["Anywhere", "Indoor", "Outdoor", "School"]],
  ["team-handshake", "Team Handshake", "Invent a simple, safe team handshake.", "HeartHandshake", ["Anywhere", "Party", "School", "Office"]],
]);

const teamworkTasks = defineCategory("Teamwork", [
  ["kindness", "Kindness", "Do one appropriate helpful thing together.", "HeartHandshake", ["Anywhere", "Party", "School", "Office"]],
  ["silent-lineup", "Silent Lineup", "Line up by birthday month without speaking.", "Users", ["Anywhere", "Party", "School", "Office"]],
  ["count-to-twenty", "Count to Twenty", "Count to twenty as a team without deciding the speaking order.", "Hash", ["Anywhere", "Party", "School", "Office"]],
  ["group-balance", "Group Balance", "Balance one safe lightweight object using help from the whole team.", "Goal", ["Anywhere", "Indoor", "Party", "School", "Office"]],
  ["memory-chain", "Memory Chain", "Build a list where each person repeats the earlier items and adds one.", "List", ["Anywhere", "Party", "School", "Office"]],
  ["shared-drawing", "Shared Drawing", "Make one drawing with each teammate adding one part.", "Palette", ["Indoor", "Party", "School", "Office"]],
  ["team-count", "Estimate Then Count", "Estimate a group of visible objects, then count them together.", "Hash", ["Anywhere", "Indoor", "Outdoor", "School", "Office"]],
  ["guide-the-drawer", "Guide the Drawer", "Describe a simple shape while one teammate draws it without seeing the example.", "Grid3X3", ["Indoor", "Party", "School", "Office"]],
  ["group-rhythm", "Group Rhythm", "Create a short clap rhythm everyone can repeat.", "Users", ["Anywhere", "Party", "School", "Office"]],
  ["build-a-tower", "Build a Small Tower", "Build a stable temporary tower from safe permitted objects, then put them back.", "Grid3X3", ["Indoor", "Party", "School", "Office"]],
  ["team-riddle", "Solve a Team Riddle", "Have one teammate offer an easy riddle for the group to solve.", "Eye", ["Anywhere", "Party", "School", "Office"]],
  ["describe-and-find", "Describe and Find", "One person describes a visible object without naming it; the team identifies it.", "Eye", ["Anywhere", "Indoor", "Outdoor", "School", "Office"]],
  ["one-minute-plan", "One-Minute Plan", "Agree on your next three tasks in under one minute.", "Clock", ["Anywhere", "Party", "School", "Office"]],
  ["team-vote", "Unanimous Vote", "Choose your group’s favorite nearby color by unanimous vote.", "Check", ["Anywhere", "Indoor", "Outdoor", "School", "Office"]],
  ["pass-the-pose", "Pass the Pose", "Each teammate adds one safe move to a growing group pose.", "Users", ["Anywhere", "Party", "School", "Office"]],
  ["group-spelling", "Group Spelling", "Spell your team name aloud with one person saying each letter.", "Hash", ["Anywhere", "Party", "School", "Office"]],
  ["spot-the-change", "Spot the Change", "One teammate changes one small visible detail; the group spots it.", "Eye", ["Anywhere", "Indoor", "Party", "School", "Office"]],
  ["team-memory", "Ten-Second Memory", "Study a safe area for ten seconds, turn away, and list what you remember.", "Clock", ["Anywhere", "Indoor", "Outdoor", "School", "Office"]],
  ["shared-category", "Category Relay", "Take turns naming items in one category without repeating.", "List", ["Anywhere", "Party", "School", "Office"]],
  ["group-word", "Build a Word", "Each teammate contributes one letter to make a word.", "Hash", ["Anywhere", "Party", "School", "Office"]],
  ["team-choice", "Two Good Choices", "Agree on two tasks your group is most excited to try.", "Star", ["Anywhere", "Party", "School", "Office"]],
  ["quiet-signal", "Quiet Team Signal", "Invent a silent signal your group can use to regroup.", "Flag", ["Anywhere", "Party", "School", "Office"]],
  ["shared-observation", "Shared Observation", "Find one detail that every teammate initially missed.", "Eye", ["Anywhere", "Indoor", "Outdoor", "School", "Office"]],
  ["team-thank-you", "Team Thank-You", "Thank someone in your group for a specific contribution.", "HeartHandshake", ["Anywhere", "Party", "School", "Office"]],
  ["finish-together", "Finish Together", "Choose and complete one simple task with everyone participating.", "Trophy", ["Anywhere", "Party", "School", "Office"]],
]);

const natureTasks = defineCategory("Nature", [
  ["plant-detail", "Plant Detail", "Find an interesting leaf, flower, or plant without picking it.", "Leaf", ["Anywhere", "Indoor", "Outdoor", "City", "School", "Office"]],
  ["animal", "Animal", "Find an animal or animal image without approaching wildlife.", "Dog", ["Anywhere", "Indoor", "Outdoor", "City"]],
  ["weather-detail", "Weather Detail", "Find something that shows today’s weather.", "Umbrella", ["Anywhere", "Outdoor", "City"]],
  ["tree-bark", "Tree Bark", "Find tree bark with an interesting texture without damaging it.", "TreePine", ["Outdoor", "City", "School"]],
  ["fallen-leaf", "Fallen Leaf", "Find a leaf already on the ground.", "Leaf", ["Outdoor", "City", "School"]],
  ["cloud-shape", "Cloud Shape", "Find a cloud that resembles something else.", "Cloud", ["Outdoor"]],
  ["bird-sound", "Bird Sound", "Pause and listen for a bird without approaching it.", "Bird", ["Outdoor", "City", "School"]],
  ["three-shades-green", "Three Shades of Green", "Find three different shades of green.", "Trees", ["Outdoor", "City", "School"]],
  ["natural-pattern", "Natural Pattern", "Find a repeated pattern in nature.", "Flower2", ["Outdoor", "City", "School"]],
  ["water-feature", "Water Feature", "Find a fountain, shoreline, puddle, or other visible water.", "Droplets", ["Outdoor", "City"]],
  ["seed-or-cone", "Seed or Cone", "Find a seed, pod, or cone without removing it from a living plant.", "Leaf", ["Outdoor", "City", "School"]],
  ["nature-shadow", "Nature Shadow", "Find a shadow made by a plant or tree.", "Cloud", ["Outdoor", "City", "School"]],
  ["rough-and-smooth", "Rough and Smooth", "Find one rough natural surface and one smooth one.", "Gem", ["Outdoor", "City", "School"]],
  ["tiny-ecosystem", "Tiny Ecosystem", "Observe a small natural area without disturbing it.", "Bug", ["Outdoor", "School"]],
  ["wind-clue", "Wind Clue", "Find something moving because of the wind.", "Waves", ["Outdoor", "City"]],
  ["sun-and-shade", "Sun and Shade", "Find one sunny spot and one shaded spot.", "Eye", ["Outdoor", "City", "School"]],
  ["nature-color", "Unexpected Nature Color", "Find a natural color other than green or brown.", "Palette", ["Outdoor", "City", "School"]],
  ["tree-shape", "Interesting Tree Shape", "Find a tree or branch with an unusual shape.", "TreePine", ["Outdoor", "City", "School"]],
  ["flower-count", "Flower Count", "Count the petals on one visible flower without picking it.", "Flower2", ["Outdoor", "City", "School"]],
  ["natural-sound", "Natural Sound", "Identify one natural sound around you.", "Bird", ["Outdoor", "City", "School"]],
  ["stone-shape", "Stone Shape", "Find a stone or rock with a recognizable shape without moving it.", "Gem", ["Outdoor", "City"]],
  ["season-clue", "Season Clue", "Find one sign of the current season.", "Clock", ["Outdoor", "City", "School"]],
  ["safe-insect", "Insect from Afar", "Spot an insect and observe it from a respectful distance.", "Bug", ["Outdoor", "School"]],
  ["plant-height", "Tall and Short Plants", "Find one tall plant and one short plant.", "Trees", ["Outdoor", "City", "School"]],
  ["nature-favorite", "Favorite Nature Find", "Choose your group’s favorite natural detail.", "Star", ["Outdoor", "City", "School"]],
]);

const cityTasks = defineCategory("City", [
  ["local-landmark", "Local Landmark", "Find a recognizable public landmark or entrance sign.", "Landmark", ["Outdoor", "City"]],
  ["crosswalk-pattern", "Crosswalk Pattern", "Find a crosswalk and observe it from a safe location.", "Grid3X3", ["Outdoor", "City"]],
  ["street-name", "Street Name", "Find a public street-name sign.", "Signpost", ["Outdoor", "City"]],
  ["transit-marker", "Transit Marker", "Find a transit stop, station, or route marker.", "Bus", ["Outdoor", "City"]],
  ["building-number", "Building Number", "Find a clearly displayed building number without entering private property.", "Hash", ["Outdoor", "City"]],
  ["old-building-detail", "Old Building Detail", "Find a building detail that looks older than its surroundings.", "Clock", ["Outdoor", "City"]],
  ["modern-building-detail", "Modern Building Detail", "Find a building detail with a modern design.", "Landmark", ["Outdoor", "City"]],
  ["public-bench", "Public Bench", "Find a public bench or seating area.", "Armchair", ["Outdoor", "City"]],
  ["bike-parking", "Bike Parking", "Find a bike rack or designated bike parking area.", "Bike", ["Outdoor", "City"]],
  ["wayfinding-arrow", "Wayfinding Arrow", "Find an arrow that directs people somewhere.", "Route", ["Indoor", "Outdoor", "City"]],
  ["city-tree", "City Tree", "Find a tree growing near a building or street.", "TreePine", ["Outdoor", "City"]],
  ["shop-window-color", "Shop Window Color", "Find a bright color in a public-facing window display.", "Palette", ["Outdoor", "City"]],
  ["public-service", "Public Service", "Find a sign or place connected to a public service.", "HeartHandshake", ["Outdoor", "City"]],
  ["city-sound", "City Sound", "Identify one sound that belongs to the city around you.", "Bus", ["Outdoor", "City"]],
  ["architectural-shape", "Architectural Shape", "Find a circle, triangle, or arch in a building.", "Circle", ["Indoor", "Outdoor", "City"]],
  ["posted-hours", "Posted Hours", "Find publicly posted opening hours.", "Clock", ["Indoor", "Outdoor", "City"]],
  ["public-map", "Public Map", "Find a public map or directory.", "Route", ["Indoor", "Outdoor", "City"]],
  ["construction-clue", "Construction Clue", "Find a safe, publicly visible sign of construction or repair.", "HardHat", ["Outdoor", "City"]],
  ["city-mascot", "City Mascot", "Find an animal, character, or mascot on a public sign.", "Dog", ["Indoor", "Outdoor", "City"]],
  ["interesting-door", "Interesting Door", "Find a public-facing door with an interesting color or design.", "Eye", ["Outdoor", "City"]],
  ["interesting-window", "Interesting Window", "Find a public-facing window with an unusual shape.", "Grid3X3", ["Outdoor", "City"]],
  ["public-art-detail", "Public Art Detail", "Find one small detail in a public artwork.", "Image", ["Indoor", "Outdoor", "City"]],
  ["city-history", "City History", "Find a plaque or sign about local history.", "Landmark", ["Indoor", "Outdoor", "City"]],
  ["safety-symbol", "Safety Symbol", "Find a public symbol designed to keep people safe.", "Flag", ["Indoor", "Outdoor", "City"]],
  ["city-favorite", "Favorite City Detail", "Choose your group’s favorite public detail nearby.", "Trophy", ["Outdoor", "City"]],
]);

const indoorTasks = defineCategory("Indoor", [
  ["interesting-texture", "Interesting Texture", "Find an indoor texture that looks interesting up close.", "Gem", ["Indoor", "School", "Office", "Party"]],
  ["organized-space", "Organized Space", "Find a satisfyingly organized public or shared area.", "Grid3X3", ["Indoor", "School", "Office"]],
  ["comfortable-seat", "Comfortable Seat", "Find the most comfortable-looking permitted seat.", "Armchair", ["Indoor", "School", "Office", "Party"]],
  ["book-title", "Book Title", "Find a book title that makes your group curious.", "School", ["Indoor", "School", "Office"]],
  ["indoor-plant", "Indoor Plant", "Find a real or artificial indoor plant.", "Leaf", ["Indoor", "School", "Office"]],
  ["exit-sign", "Exit Sign", "Find a visible exit sign without blocking any pathway.", "Signpost", ["Indoor", "School", "Office"]],
  ["ceiling-detail", "Ceiling Detail", "Find an interesting detail on the ceiling.", "Eye", ["Indoor", "School", "Office"]],
  ["floor-pattern", "Floor Pattern", "Find a repeated pattern on the floor.", "Grid3X3", ["Indoor", "School", "Office"]],
  ["quiet-corner", "Quiet Corner", "Find a permitted area that feels calm and quiet.", "Cloud", ["Indoor", "School", "Office"]],
  ["shared-supply", "Shared Supply", "Find a useful shared supply without taking it.", "School", ["Indoor", "School", "Office"]],
  ["old-technology", "Old Technology", "Find an older piece of technology on display or in shared use.", "Clock", ["Indoor", "School", "Office"]],
  ["helpful-tool", "Helpful Tool", "Find a tool people use to get work done.", "HardHat", ["Indoor", "School", "Office"]],
  ["meeting-spot", "Meeting Spot", "Find a permitted place where people gather.", "Users", ["Indoor", "School", "Office", "Party"]],
  ["tiny-office-item", "Tiny Useful Item", "Find a very small useful shared item.", "Bug", ["Indoor", "School", "Office"]],
  ["break-area", "Break Area", "Find a permitted place where people can take a short break.", "CupSoda", ["Indoor", "School", "Office"]],
  ["indoor-clock", "Indoor Clock", "Find a clock or timer inside.", "Clock", ["Indoor", "School", "Office"]],
  ["wall-display", "Wall Display", "Find an interesting public or shared wall display.", "Image", ["Indoor", "School", "Office"]],
  ["helpful-label", "Helpful Label", "Find a label that makes something easier to use.", "Badge", ["Indoor", "School", "Office"]],
  ["room-number", "Room Number", "Find a publicly displayed room number.", "Hash", ["Indoor", "School", "Office"]],
  ["indoor-color", "Indoor Color Pop", "Find one bright color in an ordinary indoor area.", "Palette", ["Indoor", "School", "Office", "Party"]],
  ["recycling-symbol", "Recycling Symbol", "Find a recycling symbol or sorting guide.", "Trash2", ["Indoor", "School", "Office"]],
  ["handmade-item", "Handmade Item", "Find something that appears to have been made by hand.", "HeartHandshake", ["Indoor", "School", "Office", "Party"]],
  ["indoor-shape", "Indoor Shape", "Find an unusual geometric shape indoors.", "Circle", ["Indoor", "School", "Office"]],
  ["window-view", "Window View", "Find an interesting view through a public or shared window.", "Eye", ["Indoor", "School", "Office"]],
  ["indoor-favorite", "Favorite Indoor Find", "Choose your group’s favorite indoor discovery.", "Star", ["Indoor", "School", "Office", "Party"]],
]);

const movementTasks = defineCategory("Movement", [
  ["safe-balance", "Five-Second Balance", "Balance safely on one foot for five seconds.", "Goal", ["Anywhere", "Outdoor", "Party", "School"]],
  ["slow-motion-walk", "Slow-Motion Walk", "Walk safely in slow motion for five steps.", "Users", ["Anywhere", "Outdoor", "Party", "School"]],
  ["mirror-moves", "Mirror Moves", "Copy a teammate’s simple safe movements for ten seconds.", "Users", ["Anywhere", "Party", "School", "Office"]],
  ["statue-freeze", "Statue Freeze", "Freeze in a safe pose when a teammate says stop.", "Landmark", ["Anywhere", "Party", "School"]],
  ["three-step-dance", "Three-Step Dance", "Create three simple dance moves appropriate for the space.", "Smile", ["Anywhere", "Party", "School"]],
  ["heel-to-toe", "Heel-to-Toe Line", "Take five careful heel-to-toe steps in a clear safe area.", "Route", ["Anywhere", "Outdoor", "Party", "School"]],
  ["animal-walk", "Animal Walk", "Choose a safe animal-inspired movement for three steps.", "Dog", ["Outdoor", "Party", "School"]],
  ["shape-stretch", "Shape Stretch", "Use your arms to make a circle, triangle, and square.", "Circle", ["Anywhere", "Party", "School", "Office"]],
  ["group-spin", "One Careful Turn", "Everyone makes one slow turn in a clear space.", "Circle", ["Outdoor", "Party", "School"]],
  ["tiptoe-five", "Tiptoe Five", "Take five quiet tiptoe steps in a safe area.", "Users", ["Anywhere", "Party", "School"]],
  ["clap-pattern", "Clap Pattern", "Create and repeat a four-beat clap pattern.", "Users", ["Anywhere", "Party", "School", "Office"]],
  ["air-draw", "Draw in the Air", "Use one finger to draw a shape in the air for teammates to guess.", "Palette", ["Anywhere", "Party", "School", "Office"]],
  ["reach-high-low", "Reach High and Low", "Safely reach high, then low, without touching anything.", "TreePine", ["Anywhere", "Party", "School", "Office"]],
  ["walk-a-shape", "Walk a Shape", "Walk the outline of a simple shape in a clear safe area.", "Route", ["Outdoor", "Party", "School"]],
  ["team-freeze-frame", "Team Freeze Frame", "Create a frozen group scene for five seconds.", "Camera", ["Anywhere", "Party", "School", "Office"]],
  ["opposite-moves", "Opposite Moves", "One teammate moves high while another moves low.", "Users", ["Anywhere", "Party", "School"]],
  ["quiet-march", "Quiet March", "March silently together for five steps.", "Users", ["Outdoor", "Party", "School"]],
  ["hand-motion-story", "Hand-Motion Story", "Tell a tiny story using only hand motions.", "HeartHandshake", ["Anywhere", "Party", "School", "Office"]],
  ["follow-the-leader", "Follow the Leader", "Follow three safe movements chosen by a teammate.", "Users", ["Anywhere", "Outdoor", "Party", "School"]],
  ["group-wave-motion", "Group Wave", "Create a wave motion that travels through the team.", "Waves", ["Anywhere", "Party", "School", "Office"]],
  ["balance-an-object", "Balance a Light Object", "Balance a safe lightweight object on one open palm.", "Goal", ["Indoor", "Party", "School", "Office"]],
  ["move-like-weather", "Move Like Weather", "Act out wind, rain, or sunshine using safe movements.", "Umbrella", ["Anywhere", "Party", "School"]],
  ["five-step-parade", "Five-Step Parade", "Create a tiny five-step team parade in a clear area.", "Flag", ["Outdoor", "Party", "School"]],
  ["motion-copy-chain", "Motion Copy Chain", "Each teammate repeats and adds one safe movement.", "Users", ["Anywhere", "Party", "School"]],
  ["victory-pose", "Victory Pose", "Create and hold a confident team victory pose.", "Trophy", ["Anywhere", "Party", "School", "Office"]],
]);

const kindnessTasks = defineCategory("Kindness", [
  ["thank-a-teammate", "Thank a Teammate", "Thank a teammate for something specific they contributed.", "HeartHandshake", ["Anywhere", "Party", "School", "Office"]],
  ["tidy-one-thing", "Tidy One Thing", "Put one shared item back where it belongs, if permitted.", "Check", ["Indoor", "Party", "School", "Office"]],
  ["hold-the-door", "Hold the Door", "Hold a door for your own group when it is safe and appropriate.", "HeartHandshake", ["Indoor", "School", "Office"]],
  ["kind-note", "Kind Note", "Write a short appropriate thank-you note for someone.", "Mailbox", ["Indoor", "Party", "School", "Office"]],
  ["share-encouragement", "Share Encouragement", "Give your team one sincere encouraging sentence.", "Smile", ["Anywhere", "Party", "School", "Office"]],
  ["notice-good-work", "Notice Good Work", "Point out something another teammate did well.", "Star", ["Anywhere", "Party", "School", "Office"]],
  ["include-everyone", "Include Everyone", "Choose the next task in a way that includes every teammate.", "Users", ["Anywhere", "Party", "School", "Office"]],
  ["offer-help", "Offer Help", "Offer appropriate help to someone in your own group.", "HeartHandshake", ["Anywhere", "Party", "School", "Office"]],
  ["positive-word", "Positive Word", "Choose one positive word that describes your team.", "Badge", ["Anywhere", "Party", "School", "Office"]],
  ["team-listener", "Team Listener", "Let one teammate finish an idea without interruption.", "Users", ["Anywhere", "Party", "School", "Office"]],
  ["clean-shared-space", "Care for the Space", "Pick up one piece of clean litter using an appropriate bin and safe handling.", "Trash2", ["Outdoor", "City", "School", "Office"]],
  ["compliment-the-idea", "Compliment an Idea", "Tell a teammate what you like about one of their ideas.", "HeartHandshake", ["Anywhere", "Party", "School", "Office"]],
  ["take-turns", "Take Turns", "Complete one task with each teammate taking a clear turn.", "Users", ["Anywhere", "Party", "School", "Office"]],
  ["welcome-suggestion", "Welcome a Suggestion", "Ask a quieter teammate which task they would like next.", "Users", ["Anywhere", "Party", "School", "Office"]],
  ["celebrate-progress", "Celebrate Progress", "Take a moment to celebrate what your group has finished.", "Trophy", ["Anywhere", "Party", "School", "Office"]],
  ["share-credit", "Share the Credit", "Name one way each teammate helped the group.", "Star", ["Anywhere", "Party", "School", "Office"]],
  ["kind-team-name", "Kind Team Name", "Confirm that your team name feels welcoming to everyone.", "Badge", ["Anywhere", "Party", "School", "Office"]],
  ["helpful-reminder", "Helpful Reminder", "Offer your group one friendly reminder about the game rules.", "Signpost", ["Anywhere", "Party", "School", "Office"]],
  ["make-room", "Make Room", "Adjust your group so everyone can see and participate.", "Users", ["Anywhere", "Party", "School", "Office"]],
  ["patient-moment", "Patient Moment", "Pause and let another teammate make the next choice.", "Clock", ["Anywhere", "Party", "School", "Office"]],
  ["kind-description", "Kind Description", "Describe one teammate using three positive words.", "Smile", ["Anywhere", "Party", "School", "Office"]],
  ["group-gratitude", "Group Gratitude", "Agree on one thing your group appreciates right now.", "HeartHandshake", ["Anywhere", "Party", "School", "Office"]],
  ["encourage-an-attempt", "Encourage an Attempt", "Encourage a teammate who tries something new.", "Trophy", ["Anywhere", "Party", "School", "Office"]],
  ["check-in", "Team Check-In", "Ask whether everyone is comfortable with the next task.", "Check", ["Anywhere", "Party", "School", "Office"]],
  ["finish-with-thanks", "Finish with Thanks", "End the game by thanking your teammates.", "HeartHandshake", ["Anywhere", "Party", "School", "Office"]],
]);

export const TASK_CATALOG: readonly CatalogTask[] = [
  ...photoTasks,
  ...findTasks,
  ...peopleTasks,
  ...creativeTasks,
  ...teamworkTasks,
  ...natureTasks,
  ...cityTasks,
  ...indoorTasks,
  ...movementTasks,
  ...kindnessTasks,
];

const TASK_CATALOG_BY_ID = new Map(TASK_CATALOG.map((task) => [task.id, task]));

export function getCatalogTask(taskId: string) {
  return TASK_CATALOG_BY_ID.get(taskId) ?? null;
}

export function searchTaskCatalog({
  category,
  query,
}: {
  category?: CatalogCategory | "All";
  query?: string;
}) {
  const normalizedQuery = query?.trim().toLowerCase() ?? "";

  return TASK_CATALOG.filter((task) => {
    if (category && category !== "All" && task.category !== category) return false;
    if (!normalizedQuery) return true;
    return [
      task.title,
      task.description,
      task.category,
      ...task.settings,
      ...task.tags,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}
