export type GameKitId =
  | "classic"
  | "quick"
  | "free-for-all"
  | "custom"
  | "birthday-party"
  | "city-explorer"
  | "office-team-building"
  | "kids-indoor"
  | "classroom";

export type GameKitTask = {
  id: string;
  title: string;
  description: string;
  icon: string;
  free?: boolean;
  sortOrder: number;
};

export type GameKit = {
  id: Exclude<GameKitId, "classic" | "custom">;
  name: string;
  gameName: string;
  category: string;
  setting: string;
  ageLabel: string;
  summary: string;
  detail: string;
  featured?: boolean;
  searchTags: readonly string[];
  playerLabel: string;
  durationLabel: string;
  playMode: "teams" | "individual";
  winCondition: "blackout" | "bingo";
  boardSize: 3 | 4 | 5;
  boardMode: "shared" | "randomized";
  freeSpace: boolean;
  proofMode: "required" | "optional" | "none";
  approvalMode: "host" | "automatic";
  timerMode: "none" | "duration" | "schedule";
  timerDurationMinutes: number;
  teamCount: number;
  tasks?: readonly GameKitTask[];
};

const birthdayTasks = tasks([
  ["birthday-group-photo", "Birthday Group Photo", "Get everyone together for a birthday photo.", "Camera"],
  ["best-party-hat", "Best Party Hat", "Find or make the best party hat in the room.", "HardHat"],
  ["birthday-dance", "Birthday Dance", "Capture someone showing off a dance move.", "Users"],
  ["something-sparkly", "Something Sparkly", "Find the sparkliest party detail.", "Gem"],
  ["favorite-snack", "Favorite Snack", "Photograph a snack your team would choose first.", "Cookie"],
  ["make-a-wish", "Make A Wish", "Strike your best make-a-wish pose.", "Star"],
  ["party-colors", "Party Colors", "Find three things that match the party colors.", "Palette"],
  ["free", "FREE", "Free space. This one is already yours.", "Star", true],
  ["funniest-face", "Funniest Face", "Take a photo of your team's funniest faces.", "Smile"],
  ["wrapped-surprise", "Wrapped Surprise", "Find a gift, bag, bow, or wrapped surprise.", "Candy"],
  ["birthday-number", "Birthday Number", "Find or make the birthday person's new age.", "Hash"],
  ["tiny-celebration", "Tiny Celebration", "Find the smallest festive detail nearby.", "Bug"],
  ["cheers", "Party Cheers", "Raise cups or hands for a team cheers.", "CupSoda"],
  ["kind-message", "Kind Message", "Write or find a kind message for the guest of honor.", "HeartHandshake"],
  ["balloon-shape", "Balloon Shape", "Find a balloon or something shaped like one.", "Circle"],
  ["final-party-pose", "Final Party Pose", "Create one strong final team pose.", "Trophy"],
]);

const cityTasks = tasks([
  ["city-team-photo", "City Team Photo", "Take a team photo with a recognizable street scene.", "Camera"],
  ["wayfinding-sign", "Wayfinding Sign", "Find a sign that helps people navigate.", "Signpost"],
  ["local-landmark", "Local Landmark", "Photograph a recognizable local landmark.", "Landmark"],
  ["public-art", "Public Art", "Find a mural, sculpture, or creative display.", "Image"],
  ["interesting-door", "Interesting Door", "Find an entrance with unusual color or detail.", "Badge"],
  ["street-number", "Street Number", "Find a street number containing a 7.", "Hash"],
  ["city-reflection", "City Reflection", "Capture a reflection in glass, water, or metal.", "Glasses"],
  ["wheels", "City Wheels", "Find a bike, scooter, cart, or other wheels.", "Bike"],
  ["free", "FREE", "Free space. This one is already yours.", "Star", true],
  ["local-menu", "Local Menu", "Find a posted menu or food special.", "Utensils"],
  ["hidden-greenery", "Hidden Greenery", "Find a plant growing in an unexpected place.", "Leaf"],
  ["pattern-detail", "Pattern Detail", "Find an interesting repeated pattern.", "Grid3X3"],
  ["public-clock", "Public Clock", "Find a clock, timer, or schedule display.", "Clock"],
  ["something-old", "Something Old", "Find a building detail or object that looks historic.", "TreePine"],
  ["something-new", "Something New", "Find something that looks newly built or installed.", "Gem"],
  ["helpful-place", "Helpful Place", "Find a place that provides a public service.", "HeartHandshake"],
  ["transit-marker", "Transit Marker", "Find a transit stop, route marker, or station sign.", "Bus"],
  ["interesting-seat", "Interesting Seat", "Find a bench or unusual place to sit.", "Armchair"],
  ["local-mascot", "Local Mascot", "Find an animal, character, or mascot on a sign.", "Dog"],
  ["water-feature", "Water Feature", "Find a fountain, shoreline, drain, or water detail.", "Droplets"],
  ["something-round", "Something Round", "Find a round detail bigger than your hand.", "Circle"],
  ["city-texture", "City Texture", "Take a close photo of an interesting texture.", "Palette"],
  ["posted-message", "Posted Message", "Find a public notice, flyer, or message board.", "Mailbox"],
  ["team-shadow", "Team Shadow", "Photograph your team's shadows together.", "Cloud"],
  ["food-window", "Food Window", "Find a window or counter serving food or drinks.", "CupSoda"],
  ["unexpected-art", "Unexpected Art", "Find a creative detail that is easy to miss.", "Flower2"],
  ["safety-symbol", "Safety Symbol", "Find a sign or marking designed to keep people safe.", "Flag"],
  ["up-high", "Look Up", "Photograph an interesting detail above eye level.", "Bird"],
  ["down-low", "Look Down", "Find a detail on the ground most people pass by.", "Bug"],
  ["local-name", "Local Name", "Find the city or neighborhood name displayed somewhere.", "Route"],
  ["team-wave", "Team Wave", "Get the whole team waving in one photo.", "Users"],
  ["finish-landmark", "Finish Landmark", "Take a final team photo at your favorite find.", "Trophy"],
]);

const officeTasks = tasks([
  ["team-introduction", "Team Introduction", "Take a photo that shows your whole team.", "Camera"],
  ["company-colors", "Company Colors", "Find three items matching the company colors.", "Palette"],
  ["creative-workspace", "Creative Workspace", "Find the most creative desk or work area.", "Armchair"],
  ["helpful-tool", "Helpful Tool", "Find a tool people rely on to get work done.", "HardHat"],
  ["meeting-spot", "Meeting Spot", "Photograph a place where people gather or collaborate.", "Users"],
  ["tiny-office-item", "Tiny Office Item", "Find the smallest useful office item.", "Bug"],
  ["snack-stash", "Snack Stash", "Find a snack people would be happy to share.", "Cookie"],
  ["best-view", "Best View", "Find the best view from the workplace.", "Eye"],
  ["team-motto", "Team Motto", "Write a five-word motto for your team.", "Flag"],
  ["something-organized", "Something Organized", "Find a satisfyingly organized space or object.", "Grid3X3"],
  ["old-technology", "Old Technology", "Find the oldest piece of technology nearby.", "Clock"],
  ["future-idea", "Future Idea", "Stage a photo representing a big future idea.", "Star"],
  ["hidden-talent", "Hidden Talent", "Show one teammate's unexpected skill.", "Trophy"],
  ["office-plant", "Office Plant", "Find a real or artificial plant.", "Leaf"],
  ["kind-note", "Kind Note", "Leave an appropriate thank-you note for someone.", "HeartHandshake"],
  ["safety-first", "Safety First", "Find a workplace safety sign or item.", "Signpost"],
  ["team-shape", "Team Shape", "Use your team to make a recognizable shape.", "Circle"],
  ["unexpected-color", "Unexpected Color", "Find a bright color in an ordinary workspace.", "Badge"],
  ["break-time", "Break Time", "Photograph a favorite place to take a short break.", "CupSoda"],
  ["office-pattern", "Office Pattern", "Find an interesting repeated pattern.", "Gem"],
  ["shared-success", "Shared Success", "Find something that represents a team achievement.", "Goal"],
  ["final-team-pose", "Final Team Pose", "Create a confident final team photo.", "Trophy"],
]);

const kidsIndoorTasks = tasks([
  ["silly-team-name", "Silly Team Name", "Invent the silliest school-appropriate team name.", "Smile"],
  ["something-red", "Something Red", "Find something red.", "Badge"],
  ["soft-thing", "Something Soft", "Find something soft to touch.", "Cloud"],
  ["round-thing", "Something Round", "Find something shaped like a circle.", "Circle"],
  ["favorite-book", "Favorite Book", "Find a book your team would like to read.", "School"],
  ["tiny-toy", "Tiny Toy", "Find a very small toy or object.", "Bug"],
  ["animal-picture", "Animal Picture", "Find a picture or toy of an animal.", "Dog"],
  ["free", "FREE", "Free space. This one is already yours.", "Star", true],
  ["something-shiny", "Something Shiny", "Find something shiny or reflective.", "Gem"],
  ["funny-hat", "Funny Hat", "Find or make a funny hat.", "HardHat"],
  ["number-five", "Number Five", "Find the number 5.", "Hash"],
  ["building-blocks", "Building Blocks", "Build a small tower or shape.", "Grid3X3"],
  ["happy-dance", "Happy Dance", "Show your team's happiest dance move.", "Smile"],
  ["helping-hands", "Helping Hands", "Do something helpful together.", "HeartHandshake"],
  ["rainbow-colors", "Rainbow Colors", "Find three different bright colors.", "Palette"],
  ["winning-cheer", "Winning Cheer", "Invent one final quiet superhero cheer.", "Trophy"],
]);

export const GAME_KITS: readonly GameKit[] = [
  {
    id: "classroom",
    name: "Classroom Starter",
    gameName: "Classroom Scavenger Bingo",
    category: "Schools",
    setting: "Classroom or library",
    ageLabel: "Students",
    summary: "A no-photo classroom game with simple observation and teamwork prompts.",
    detail: "Shared 3×3 boards. Students mark finds without uploading photos.",
    featured: true,
    searchTags: ["school", "teacher", "student", "classroom", "library", "no photo"],
    playerLabel: "2 teams",
    durationLabel: "30 min",
    playMode: "teams",
    winCondition: "bingo",
    boardSize: 3,
    boardMode: "shared",
    freeSpace: true,
    proofMode: "none",
    approvalMode: "automatic",
    timerMode: "duration",
    timerDurationMinutes: 30,
    teamCount: 2,
    tasks: kidsIndoorTasks,
  },
  {
    id: "quick",
    name: "Quick Bingo",
    gameName: "Quick Bingo",
    category: "Easy start",
    setting: "Anywhere",
    ageLabel: "All ages",
    summary: "A fast, low-setup game for almost any gathering.",
    detail: "Shared 3×3 boards with automatic photo approval.",
    featured: true,
    searchTags: ["quick", "easy", "general", "party", "indoor", "outdoor"],
    playerLabel: "2 teams",
    durationLabel: "30 min",
    playMode: "teams",
    winCondition: "bingo",
    boardSize: 3,
    boardMode: "shared",
    freeSpace: true,
    proofMode: "required",
    approvalMode: "automatic",
    timerMode: "duration",
    timerDurationMinutes: 30,
    teamCount: 2,
  },
  {
    id: "free-for-all",
    name: "Free-for-All",
    gameName: "Free-for-All Hunt",
    category: "Individuals",
    setting: "Anywhere",
    ageLabel: "Teens and adults",
    summary: "Everyone plays on a personal board at their own pace.",
    detail: "Different 4×4 boards with optional photos.",
    searchTags: ["solo", "individual", "personal", "casual", "general"],
    playerLabel: "Individual",
    durationLabel: "45 min",
    playMode: "individual",
    winCondition: "bingo",
    boardSize: 4,
    boardMode: "randomized",
    freeSpace: false,
    proofMode: "optional",
    approvalMode: "automatic",
    timerMode: "duration",
    timerDurationMinutes: 45,
    teamCount: 0,
  },
  {
    id: "birthday-party",
    name: "Birthday Party",
    gameName: "Birthday Party Hunt",
    category: "Celebration",
    setting: "Indoor or outdoor",
    ageLabel: "All ages",
    summary: "Playful photo challenges built around the guest of honor.",
    detail: "Different 3×3 boards that work indoors or outside.",
    featured: true,
    searchTags: ["birthday", "party", "celebration", "family", "photo"],
    playerLabel: "2 teams",
    durationLabel: "45 min",
    playMode: "teams",
    winCondition: "bingo",
    boardSize: 3,
    boardMode: "randomized",
    freeSpace: true,
    proofMode: "required",
    approvalMode: "automatic",
    timerMode: "duration",
    timerDurationMinutes: 45,
    teamCount: 2,
    tasks: birthdayTasks,
  },
  {
    id: "city-explorer",
    name: "City Explorer",
    gameName: "City Explorer Hunt",
    category: "Outdoors",
    setting: "City or neighborhood",
    ageLabel: "Teens and adults",
    summary: "A longer hunt for downtowns, boardwalks, or neighborhoods.",
    detail: "Varied 5×5 boards with host-reviewed photo proof.",
    searchTags: ["city", "downtown", "outdoor", "travel", "neighborhood", "long"],
    playerLabel: "3 teams",
    durationLabel: "90 min",
    playMode: "teams",
    winCondition: "blackout",
    boardSize: 5,
    boardMode: "randomized",
    freeSpace: true,
    proofMode: "required",
    approvalMode: "host",
    timerMode: "duration",
    timerDurationMinutes: 90,
    teamCount: 3,
    tasks: cityTasks,
  },
  {
    id: "office-team-building",
    name: "Office Team-Building",
    gameName: "Office Team-Building Hunt",
    category: "Work",
    setting: "Office or workplace",
    ageLabel: "Adults",
    summary: "Friendly challenges that reward teamwork and observation.",
    detail: "Different 4×4 boards with optional photo proof.",
    searchTags: ["office", "work", "company", "team building", "coworkers"],
    playerLabel: "3 teams",
    durationLabel: "60 min",
    playMode: "teams",
    winCondition: "bingo",
    boardSize: 4,
    boardMode: "randomized",
    freeSpace: false,
    proofMode: "optional",
    approvalMode: "automatic",
    timerMode: "duration",
    timerDurationMinutes: 60,
    teamCount: 3,
    tasks: officeTasks,
  },
  {
    id: "kids-indoor",
    name: "Kids’ Indoor Hunt",
    gameName: "Kids’ Indoor Hunt",
    category: "Family",
    setting: "Home or classroom",
    ageLabel: "Kids and families",
    summary: "Simple, safe prompts for homes, classrooms, or community rooms.",
    detail: "Shared 3×3 boards with no photo uploads.",
    featured: true,
    searchTags: ["kids", "children", "family", "classroom", "home", "indoor"],
    playerLabel: "2 teams",
    durationLabel: "30 min",
    playMode: "teams",
    winCondition: "bingo",
    boardSize: 3,
    boardMode: "shared",
    freeSpace: true,
    proofMode: "none",
    approvalMode: "automatic",
    timerMode: "duration",
    timerDurationMinutes: 30,
    teamCount: 2,
    tasks: kidsIndoorTasks,
  },
];

export function getGameKit(id: string) {
  return GAME_KITS.find((kit) => kit.id === id);
}

function tasks(
  values: ReadonlyArray<readonly [string, string, string, string, boolean?]>,
): readonly GameKitTask[] {
  return values.map(([id, title, description, icon, free], index) => ({
    id,
    title,
    description,
    icon,
    sortOrder: index + 1,
    ...(free ? { free: true } : {}),
  }));
}
