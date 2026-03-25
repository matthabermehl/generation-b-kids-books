import { Link } from "react-router-dom";
import { ArrowRight, CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import { getMoneyLessonLabel } from "@/lib/money-lessons";
import { useParentFlow } from "@/lib/parent-flow";
import { toSafeCheckoutUrl } from "@/lib/safe-url";

export function CheckoutPage() {
  const {
    banner,
    characterState,
    checkoutUrl,
    clearBanner,
    clearError,
    draft,
    error,
    fallbackMarkPaid,
    hasApprovedCharacter,
    orderStatus,
    startCheckout
  } = useParentFlow();

  const continueToCheckout = async () => {
    clearError();
    const url = await startCheckout();
    const safeUrl = toSafeCheckoutUrl(url);
    if (safeUrl) {
      window.location.assign(safeUrl);
    }
  };

  return (
    <main className="sw-page sw-container mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <Card className="sw-panel border-border/70 bg-white/95">
        <CardHeader className="sw-page-intro space-y-3">
          <div className="sw-eyebrow inline-flex items-center gap-2 text-sm font-medium text-slate-500">
            <CreditCard className="size-4" />
            Step 2 of 3
          </div>
          <h1 className="sw-page-title text-2xl font-semibold text-slate-950">Review the order and start checkout</h1>
          <CardDescription className="text-base">
            Payment stays behind the character approval gate so the selected illustration reference is locked first.
          </CardDescription>
        </CardHeader>
        <CardContent className="sw-split grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            {banner ? (
              <Alert>
                <AlertTitle>{banner.title}</AlertTitle>
                <AlertDescription>{banner.message}</AlertDescription>
                <Button variant="ghost" size="sm" onClick={clearBanner} className="w-fit">
                  Dismiss
                </Button>
              </Alert>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Unable to continue to checkout</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {!hasApprovedCharacter ? (
              <Alert>
                <AlertTitle>Approve a character before checkout</AlertTitle>
                <AlertDescription>
                  The checkout endpoint is intentionally blocked until one character candidate is selected on the dashboard.
                </AlertDescription>
              </Alert>
            ) : null}

            <Card className="sw-panel sw-panel--tinted border-border/70 bg-slate-50/80">
              <CardHeader>
                <h2 className="text-lg font-semibold text-slate-950">Order summary</h2>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="sw-meta-grid sw-meta-grid--two grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase">Child</p>
                    <p className="mt-1 font-medium text-slate-900">{draft.childFirstName}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase">Profile</p>
                    <p className="mt-1 text-slate-700">{draft.readingProfileId.replace(/_/g, " ")}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase">Lesson</p>
                  <p className="mt-1 text-slate-700">{getMoneyLessonLabel(draft.moneyLessonKey)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase">Interests</p>
                  <p className="mt-1 text-slate-700">{draft.interestTags}</p>
                </div>
                <div>
                  <p className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase">Character brief</p>
                  <p className="mt-1 text-slate-700">{characterState?.characterDescription ?? draft.characterDescription}</p>
                </div>
                {orderStatus ? (
                  <>
                    <Separator />
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge value={orderStatus.status} />
                      <StatusBadge value={orderStatus.bookStatus} />
                    </div>
                    <div className="grid gap-3 text-slate-600 sm:grid-cols-2">
                      <p>Order: {orderStatus.orderId}</p>
                      <p>Book: {orderStatus.bookId}</p>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="sw-panel border-border/70 bg-white">
              <CardHeader>
                <h2 className="text-lg font-semibold text-slate-950">Approved character</h2>
                <CardDescription>The selected reference image will be fed into every subsequent page-art edit call.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {characterState?.selectedCharacterImageUrl ? (
                  <img
                    src={characterState.selectedCharacterImageUrl}
                    alt="Approved character reference"
                    className="sw-gallery-media aspect-[2/3] w-full rounded-2xl border border-border/70 object-cover bg-white"
                  />
                ) : (
                  <div className="sw-empty flex aspect-[2/3] items-center justify-center rounded-2xl border border-dashed border-border/70 bg-slate-50 text-sm text-slate-500">
                    No approved character selected yet.
                  </div>
                )}
                <div className="space-y-2">
                  <Button onClick={continueToCheckout} className="w-full" disabled={!hasApprovedCharacter}>
                    Continue to Stripe Checkout
                    <ArrowRight className="size-4" />
                  </Button>
                  {checkoutUrl ? (
                    <Button asChild variant="outline" className="w-full">
                      <a href={checkoutUrl} rel="noreferrer">
                        Reopen checkout link
                        <ExternalLink className="size-4" />
                      </a>
                    </Button>
                  ) : null}
                  <Button asChild variant="ghost" className="w-full">
                    <Link to="/create">{hasApprovedCharacter ? "Edit character selection" : "Return to character approval"}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="sw-panel border-amber-200 bg-amber-50/70">
              <CardHeader>
                <h2 className="text-base font-semibold text-slate-950">Internal or dev fallback</h2>
                <CardDescription>
                  This action exists for operator/dev validation only. It should stay visually secondary.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={fallbackMarkPaid} variant="outline" className="w-full border-amber-200 bg-white">
                  <RefreshCw className="size-4" />
                  Fallback mark paid
                </Button>
                <Button asChild variant="ghost" className="w-full justify-start px-0 text-slate-500">
                  <Link to="/books/current">Go to current book workspace</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
