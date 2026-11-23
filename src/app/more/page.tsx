import Link from "next/link";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const MENU_GROUPS = [
  {
    label: "Library",
    items: [
      {
        href: "/exercises",
        title: "Exercises",
        description: "All exercises · search, filter, edit, notes",
        icon: "🏋️",
      },
      {
        href: "/templates",
        title: "Templates",
        description: "Workout templates with targets and categories",
        icon: "📋",
      },
      {
        href: "/calculator",
        title: "1RM Calculator",
        description: "Quick Epley e1RM + load tables per rep range",
        icon: "🧮",
      },
    ],
  },
  {
    label: "History & Analysis",
    items: [
      {
        href: "/strength",
        title: "Strength Standards",
        description: "Benchmark lifts vs StrengthLevel tiers (Beginner → Elite)",
        icon: "💪",
      },
      {
        href: "/silhouette",
        title: "Body Heatmap",
        description: "Muscle silhouette colored by volume — spot imbalances at a glance",
        icon: "🫀",
      },
      {
        href: "/asymmetry",
        title: "Asymmetry Monitor",
        description: "L/R gap leaderboard across every unilateral lift",
        icon: "⚖️",
      },
      {
        href: "/ratios",
        title: "Lift Ratios",
        description: "Bench:Row, Squat:DL, OHP:Bench — strength balance vs targets",
        icon: "⚙️",
      },
      {
        href: "/prs",
        title: "PR Timeline",
        description: "Every personal record ever, chronological feed",
        icon: "🏆",
      },
      {
        href: "/streaks",
        title: "Streaks",
        description: "Weekly training consistency · current + longest",
        icon: "🔥",
      },
      {
        href: "/recap",
        title: "Recap",
        description: "Year/period review · volume, PRs, top lifts, YoY deltas",
        icon: "📊",
      },
      {
        href: "/tsb",
        title: "Training Stress Balance",
        description: "Fitness vs fatigue · strength + cardio combined",
        icon: "⚡",
      },
      {
        href: "/plateaus",
        title: "Plateau Detector",
        description: "Lifts that have stalled — with deload/variant suggestions",
        icon: "🚧",
      },
      {
        href: "/eta",
        title: "Predictive ETA",
        description: "When you'll hit the next StrengthLevel tier at current trend",
        icon: "🎯",
      },
      {
        href: "/workouts",
        title: "All Workouts",
        description: "Full chronological list of every session",
        icon: "📅",
      },
      {
        href: "/wellness",
        title: "Wellness",
        description: "Injury areas, trends, symptom history",
        icon: "🩹",
      },
    ],
  },
  {
    label: "AI & Profile",
    items: [
      {
        href: "/chat",
        title: "Ask Claude",
        description: "AI fitness advisor with access to all your data",
        icon: "💬",
      },
      {
        href: "/profile",
        title: "About Me",
        description: "Injuries, goals, training style · context for the AI advisor",
        icon: "🧬",
      },
    ],
  },
  {
    label: "Cardio",
    items: [
      {
        href: "/cardio",
        title: "Cardio Activities",
        description: "Cycling, rowing, running, hiking synced from Strava",
        icon: "🚴",
      },
      {
        href: "/cardio/templates",
        title: "Cardio Templates",
        description: "Prescribed cardio sessions · ruck, VO2, Shred Shed, rower",
        icon: "📋",
      },
      {
        href: "/integrations/strava",
        title: "Strava Connection",
        description: "Manage your Strava sync",
        icon: "🔗",
      },
    ],
  },
  {
    label: "Data",
    items: [
      {
        href: "/digest",
        title: "Weekly Digest",
        description: "Markdown summary to share with your CoS",
        icon: "📋",
      },
      {
        href: "/export",
        title: "Export",
        description: "Bulk download — CSV or full JSON backup",
        icon: "💾",
      },
    ],
  },
];

export default function MorePage() {
  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight">More</h1>
      <p className="text-muted-foreground text-sm mt-1">
        Management, history, and data tools
      </p>

      <div className="mt-6 space-y-6">
        {MENU_GROUPS.map((group) => (
          <div key={group.label}>
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">
              {group.label}
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} prefetch>
                  <Card className="p-4 h-full hover:bg-accent/50 transition-colors cursor-pointer">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl shrink-0" aria-hidden>
                        {item.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium">{item.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.description}
                        </p>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0 mt-1">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
