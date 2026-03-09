import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BookText, CreditCard, UserRound } from "lucide-react";
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
import { StatusBadge } from "@/components/StatusBadge";
import { type LessonKey, readingProfileOptions, type ReadingProfile, useParentFlow, validateAgeYears } from "@/lib/parent-flow";

export function CreateOrderPage() {
  const navigate = useNavigate();
  const { createOrder, draft, error, clearError, hasActiveOrder, orderStatus, updateDraft } = useParentFlow();
  const ageError = validateAgeYears(draft.ageYears, draft.readingProfileId);
  const selectedProfile = readingProfileOptions.find((option) => option.value === draft.readingProfileId) ?? readingProfileOptions[0];

  const submit = async () => {
    clearError();
    const payload = await createOrder();
    if (payload) {
      navigate("/checkout");
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-border/70 bg-white/95">
          <CardHeader className="space-y-3">
            <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-500">
              <UserRound className="size-4" />
              Step 1 of 3
            </div>
            <h1 className="text-2xl font-semibold text-slate-950">Create a child-safe order</h1>
            <CardDescription className="text-base">
              Capture the details once. The next step handles checkout, and the final step tracks the live book.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-700">1</div>
                <div>
                  <p className="font-medium text-slate-900">Create the order</p>
                  <p>Choose the lesson, reading profile, and interests.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-700">2</div>
                <div>
                  <p className="font-medium text-slate-900">Complete checkout</p>
                  <p>Launch Stripe checkout from a dedicated summary page.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-700">3</div>
                <div>
                  <p className="font-medium text-slate-900">Track the live build</p>
                  <p>Load previews, fetch the PDF, or delete the child profile later.</p>
                </div>
              </div>
            </div>
            {hasActiveOrder && orderStatus ? (
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

        <Card className="border-border/70 bg-white/95 shadow-sm">
          <CardHeader>
            <h2 className="text-lg font-semibold text-slate-950">Order details</h2>
            <CardDescription>These details stay in the current session until the order is submitted.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Unable to create order</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="child-first-name">Child first name</Label>
                <Input
                  id="child-first-name"
                  value={draft.childFirstName}
                  onChange={(event) => updateDraft("childFirstName", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pronouns">Pronouns</Label>
                <Input
                  id="pronouns"
                  value={draft.pronouns}
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
                  value={Number.isFinite(draft.ageYears) ? draft.ageYears : ""}
                  onChange={(event) => {
                    updateDraft("ageYears", event.target.value === "" ? Number.NaN : Number(event.target.value));
                  }}
                />
                <p className={ageError ? "text-sm text-rose-600" : "text-sm text-slate-500"}>
                  {ageError ?? `${selectedProfile.label} supports ages ${selectedProfile.minAge}-${selectedProfile.maxAge}.`}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reading-profile">Reading profile</Label>
                <Select
                  value={draft.readingProfileId}
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
              <Select value={draft.moneyLessonKey} onValueChange={(value) => updateDraft("moneyLessonKey", value as LessonKey)}>
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
                onChange={(event) => updateDraft("interestTags", event.target.value)}
                placeholder="baking, forest, bikes"
              />
              <p className="text-sm text-slate-500">Use commas to separate a few interests for story specificity.</p>
            </div>

            <div className="flex flex-col gap-3 border-t border-border/80 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="outline" asChild>
                <Link to="/">Back</Link>
              </Button>
              <Button onClick={submit} className="sm:min-w-52" disabled={Boolean(ageError)}>
                Create order
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
