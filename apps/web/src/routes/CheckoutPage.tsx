import { Link } from "react-router-dom";
import { ArrowRight, CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import { useParentFlow } from "@/lib/parent-flow";
import { toSafeCheckoutUrl } from "@/lib/safe-url";

export function CheckoutPage() {
  const { banner, checkoutUrl, clearBanner, clearError, draft, error, fallbackMarkPaid, orderStatus, startCheckout } =
    useParentFlow();

  const continueToCheckout = async () => {
    clearError();
    const url = await startCheckout();
    const safeUrl = toSafeCheckoutUrl(url);
    if (safeUrl) {
      window.location.assign(safeUrl);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <Card className="border-border/70 bg-white/95">
        <CardHeader className="space-y-3">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-slate-500">
            <CreditCard className="size-4" />
            Step 2 of 3
          </div>
          <h1 className="text-2xl font-semibold text-slate-950">Review the order and start checkout</h1>
          <CardDescription className="text-base">
            This step is focused on payment. The next screen becomes the home for live book status and downloads.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
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

            <Card className="border-border/70 bg-slate-50/80">
              <CardHeader>
                <h2 className="text-lg font-semibold text-slate-950">Order summary</h2>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
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
                  <p className="mt-1 text-slate-700">{draft.moneyLessonKey.replace(/_/g, " ")}</p>
                </div>
                <div>
                  <p className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase">Interests</p>
                  <p className="mt-1 text-slate-700">{draft.interestTags}</p>
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
            <Card className="border-border/70 bg-white">
              <CardHeader>
                <h2 className="text-lg font-semibold text-slate-950">Payment actions</h2>
                <CardDescription>Keep the main path simple: checkout first, then come back for build progress.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={continueToCheckout} className="w-full">
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
                  <Link to="/create">Edit order details</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/70">
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
