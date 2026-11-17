export const STAGES = [
  {
    id: "utility",
    title: "Robotic Manipulation",
    titleLines: ["Robotic", "Manipulation"],
    short: "Modular arms",
    description:
      "Modular robotic arms for handling objects and positioning tools. Configure the end attachment around the task at hand.",
    implement: "arms",
  },
  {
    id: "spraying",
    title: "Precision Spraying",
    titleLines: ["Precision", "Spraying"],
    short: "Spraying",
    description:
      "Carries a tank and spray assembly for applying liquid treatments to crops, supporting spraying work along field and orchard rows.",
    implement: "spraying",
  },
  {
    id: "orchard",
    title: "3-Point Hitch System",
    titleLines: ["3-Point Hitch", "System"],
    short: "3 point hitch",
    description:
      "Connects compatible implements to the rear of the rover, allowing one platform to support different field tasks as attachments are changed.",
    implement: "hitch",
  },
  {
    id: "towed",
    title: "Autonomous Payload Carrier",
    titleLines: ["Autonomous", "Payload Carrier"],
    short: "Trolley",
    description:
      "Moves materials in a towed trolley, helping transport tools, supplies and harvested produce between work areas.",
    implement: "trolley",
  },
  {
    id: "onboard",
    title: "Material Handling Tray",
    titleLines: ["Material Handling", "Tray"],
    short: "Tray",
    description:
      "Carries tools, crates and supplies directly on the rover, keeping materials close at hand for field work and short transport tasks.",
    implement: "trey",
  },
];
