import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BookText, CheckCircle2, CreditCard, RefreshCw, UserRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { type LessonKey, readingProfileOptions, type ReadingProfile, useParentFlow, validateAgeYears } from "@/lib/parent-flow";

function formatAttemptTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function CreateOrderPage() {
  const navigate = useNavigate();
  const {
    characterState,
    clearError,
    createOrder,
    draft,
    error,
    generateCharacterCandidate,
    hasActiveOrder,
    hasApprovedCharacter,
    isGeneratingCharacter,
    isSelectingCharacter,
    orderStatus,
    selectCharacterCandidate,
    updateDraft
  } = useParentFlow();
  const ageError = validateAgeYears(draft.ageYears, draft.readingProfileId);
  const selectedProfile = readingProfileOptions.find((option) => option.value === draft.readingProfileId) ?? readingProfileOptions[0];
  const isCharacterFlowActive = hasActiveOrder && orderStatus?.status === "created" && orderStatus.bookStatus === "draft";
  const showExistingOrderAlert = hasActiveOrder && !isCharacterFlowActive;

  const submit = async () => {
    clearError();
    await createOrder();
  };

  const generate = async () => {
    clearError();
    await generateCharacterCandidate();
  };

  const selectCandidate = async (imageId: string) => {
    clearError();
    await selectCharacterCandidate(imageId);
  };

  return (
    <main className="sw-page sw-container mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="sw-split grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <Card className="sw-panel sw-panel--tinted border-border/70 bg-white/95">
          <CardHeader className="sw-page-intro space-y-3">
            <div className="sw-eyebrow inline-flex items-center gap-2 text-sm font-medium text-slate-500">
              <UserRound className="size-4" />
              Step 1 of 3
            </div>
            <h1 className="sw-page-title text-2xl font-semibold text-slate-950">Create the order and approve the character</h1>
            <CardDescription className="text-base">
              Capture the child details once, then lock in the illustration reference before the checkout step.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <div className="sw-list space-y-3">
              <div className="sw-list-item flex items-center gap-3">
                <div className="sw-list-index flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-700">1</div>
                <div>
                  <p className="font-medium text-slate-900">Create the order</p>
                  <p>Choose the lesson, reading profile, and interests.</p>
                </div>
              </div>
              <div className="sw-list-item flex items-center gap-3">
                <div className="sw-list-index flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-700">2</div>
                <div>
                  <p className="font-medium text-slate-900">Approve the character</p>
                  <p>Generate up to 10 watercolor character candidates and select one canonical reference.</p>
                </div>
              </div>
              <div className="sw-list-item flex items-center gap-3">
                <div className="sw-list-index flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-700">3</div>
                <div>
                  <p className="font-medium text-slate-900">Checkout and track the build</p>
                  <p>Launch Stripe checkout, then switch to the live book workspace.</p>
                </div>
              </div>
            </div>
            {showExistingOrderAlert && orderStatus ? (
              <Alert>
                <BookText className="size-4" />
                <AlertTitle>Existing active order</AlertTitle>
                <AlertDescription className="space-y-3">
                  <span className="block">You already have an active order in progress.</span>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge value={orderStatus.status} />
                    <StatusBadge value={orderStatus.bookStatus} />
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-fit">
                    <Link to="/books/current">Resume current book</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card className="sw-panel border-border/70 bg-white/95 shadow-sm">
          <CardHeader>
            <h2 className="text-lg font-semibold text-slate-950">Order details</h2>
            <CardDescription>
              {isCharacterFlowActive
                ? "The draft order is saved. Story settings stay fixed while you approve the character."
                : "These details stay in the current session until the order is submitted."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Unable to continue</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="child-first-name">Child first name</Label>
                <Input
                  id="child-first-name"
                  value={draft.childFirstName}
                  disabled={hasActiveOrder}
                  onChange={(event) => updateDraft("childFirstName", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pronouns">Pronouns</Label>
                <Input
                  id="pronouns"
                  value={draft.pronouns}
                  disabled={hasActiveOrder}
                  onChange={(event) => updateDraft("pronouns", event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="age-years">Age</Label>
                <Input
                  id="age-years"
                  type="number"
                  min={selectedProfile.minAge}
                  max={selectedProfile.maxAge}
                  disabled={hasActiveOrder}
                  value={Number.isFinite(draft.ageYears) ? draft.ageYears : ""}
                  onChange={(event) => {
                    updateDraft("ageYears", event.target.value === "" ? Number.NaN : Number(event.target.value));
                  }}
                />
              <p className={ageError ? "sw-field-note text-sm text-rose-600" : "sw-field-note text-sm text-slate-500"}>
                {ageError ?? `${selectedProfile.label} supports ages ${selectedProfile.minAge}-${selectedProfile.maxAge}.`}
              </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reading-profile">Reading profile</Label>
                <Select
                  value={draft.readingProfileId}
                  disabled={hasActiveOrder}
                  onValueChange={(value) => updateDraft("readingProfileId", value as ReadingProfile)}
                >
                  <SelectTrigger id="reading-profile" className="w-full">
                    <SelectValue placeholder="Choose a reading profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {readingProfileOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="money-lesson">Money lesson</Label>
              <Select
                value={draft.moneyLessonKey}
                disabled={hasActiveOrder}
                onValueChange={(value) => updateDraft("moneyLessonKey", value as LessonKey)}
              >
                <SelectTrigger id="money-lesson" className="w-full">
                  <SelectValue placeholder="Choose the lesson" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inflation_candy">Why coins buy less candy</SelectItem>
                  <SelectItem value="saving_later">Why saving helps later</SelectItem>
                  <SelectItem value="delayed_gratification">Why waiting makes things better</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="interests">Interests</Label>
              <Input
                id="interests"
                value={draft.interestTags}
                disabled={hasActiveOrder}
                onChange={(event) => updateDraft("interestTags", event.target.value)}
                placeholder="baking, forest, bikes"
              />
              <p className="sw-field-note text-sm text-slate-500">Use commas to separate a few interests for story specificity.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="character-description">Character description</Label>
              <Textarea
                id="character-description"
                rows={5}
                value={draft.characterDescription}
                onChange={(event) => updateDraft("characterDescription", event.target.value)}
                placeholder="Describe the child's appearance, clothing, favorite props, and any must-keep illustration details."
              />
              <p className="sw-field-note text-sm text-slate-500">
                This description becomes the reusable illustration anchor for every scene in the book.
              </p>
            </div>

            {!hasActiveOrder ? (
              <div className="sw-action-bar flex flex-col gap-3 border-t border-border/80 pt-2 sm:flex-row sm:items-center sm:justify-between">
                <Button variant="outline" asChild>
                  <Link to="/">Back</Link>
                </Button>
                <Button onClick={submit} className="sm:min-w-52" disabled={Boolean(ageError)}>
                  Create order
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {isCharacterFlowActive ? (
        <Card className="sw-panel border-border/70 bg-white/95 shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Character approval</CardTitle>
              <CardDescription>
                Generate candidates in the watercolor house style, then select the one that should anchor the whole book.
              </CardDescription>
            </div>
            <div className="sw-inline-pill rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
              {characterState?.generationCount ?? 0} / {characterState?.maxGenerations ?? 10} generations used
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {hasApprovedCharacter && characterState?.selectedCharacterImageUrl ? (
              <Alert>
                <CheckCircle2 className="size-4" />
                <AlertTitle>Character selected</AlertTitle>
                <AlertDescription>
                  This approved reference is what the page-generation workflow will carry forward into the rest of the book.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <CreditCard className="size-4" />
                <AlertTitle>Checkout stays blocked until one character is approved</AlertTitle>
                <AlertDescription>
                  Generate a candidate, review it, and explicitly select the one you want before continuing.
                </AlertDescription>
              </Alert>
            )}

            <div className="sw-panel sw-panel--tinted flex flex-col gap-3 rounded-2xl border border-border/70 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">
                  {characterState?.remainingGenerations ?? 10} generations remaining
                </p>
                <p className="text-sm text-slate-500">
                  Editing the description affects the next generation only. Your current selection stays put until you choose a new one.
                </p>
              </div>
              <Button onClick={generate} disabled={isGeneratingCharacter || !characterState?.canGenerateMore}>
                {isGeneratingCharacter ? "Generating…" : characterState?.generationCount ? "Try again" : "Generate character"}
                <RefreshCw className="size-4" />
              </Button>
            </div>

            {characterState?.candidates.length ? (
              <div className="sw-gallery-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {characterState.candidates.map((candidate) => (
                  <Card
                    key={candidate.imageId}
                    className={`sw-gallery-card ${candidate.isSelected ? "sw-gallery-card--selected border-emerald-300 shadow-sm" : "border-border/70"}`}
                  >
                    <CardContent className="space-y-3 p-4">
                      {candidate.imageUrl ? (
                        <img
                          src={candidate.imageUrl}
                          alt="Generated character candidate"
                          className="sw-gallery-media aspect-[2/3] w-full rounded-xl border border-border/60 object-cover bg-white"
                        />
                      ) : (
                        <div className="sw-empty flex aspect-[2/3] items-center justify-center rounded-xl border border-dashed border-border/60 bg-slate-50 text-sm text-slate-500">
                          Preview unavailable
                        </div>
                      )}
                      <div className="space-y-1 text-sm">
                        <p className="font-medium text-slate-900">
                          Candidate {characterState.generationCount - characterState.candidates.indexOf(candidate)}
                        </p>
                        <p className="text-slate-500">{formatAttemptTime(candidate.createdAt)}</p>
                      </div>
                      <Button
                        variant={candidate.isSelected ? "secondary" : "outline"}
                        className="w-full"
                        disabled={candidate.isSelected || isSelectingCharacter}
                        onClick={() => selectCandidate(candidate.imageId)}
                      >
                        {candidate.isSelected ? "Selected" : "Use this character"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="sw-empty rounded-2xl border border-dashed border-border/70 bg-slate-50/50 p-8 text-center text-sm text-slate-500">
                No character candidates yet. Generate the first watercolor portrait to start the approval loop.
              </div>
            )}

            <div className="sw-action-bar flex flex-col gap-3 border-t border-border/80 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="outline" asChild>
                <Link to="/">Back</Link>
              </Button>
              <Button onClick={() => navigate("/checkout")} disabled={!hasApprovedCharacter}>
                Continue to checkout
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
