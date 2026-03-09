import { useState } from "react";
import { Link } from "react-router-dom";
import { CircleAlert, Download, ExternalLink, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { useParentFlow } from "@/lib/parent-flow";

export function CurrentBookPage() {
  const [showTranscript, setShowTranscript] = useState(false);
  const {
    banner,
    bookPayload,
    clearBanner,
    clearError,
    deleteChildProfile,
    downloadUrl,
    error,
    loadBook,
    loadDownload,
    orderStatus,
    privacyStatus,
    refreshOrder
  } = useParentFlow();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <Card className="border-border/70 bg-white/95">
            <CardHeader className="space-y-3">
              <h1 className="text-2xl font-semibold text-slate-950">Current book workspace</h1>
              <CardDescription className="text-base">
                Track build status, refresh the book state, and pull previews or the PDF from one place.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  <CircleAlert className="size-4" />
                  <AlertTitle>Action failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              {privacyStatus ? (
                <Alert>
                  <ShieldAlert className="size-4" />
                  <AlertTitle>Privacy action queued</AlertTitle>
                  <AlertDescription>{privacyStatus}</AlertDescription>
                </Alert>
              ) : null}

              {orderStatus ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge value={orderStatus.status} />
                    <StatusBadge value={orderStatus.bookStatus} />
                  </div>
                  <div className="grid gap-4 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase">Order</p>
                      <p className="mt-1 text-slate-900">{orderStatus.orderId}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase">Book</p>
                      <p className="mt-1 text-slate-900">{orderStatus.bookId}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium tracking-[0.16em] text-slate-500 uppercase">Created</p>
                      <p className="mt-1 text-slate-900">{new Date(orderStatus.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                </>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => {
                    clearError();
                    void refreshOrder();
                  }}
                >
                  <RefreshCw className="size-4" />
                  Refresh status
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    clearError();
                    void loadBook();
                  }}
                >
                  Load previews
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    clearError();
                    void loadDownload();
                  }}
                >
                  <Download className="size-4" />
                  Get PDF link
                </Button>
              </div>
              {downloadUrl ? (
                <Alert>
                  <AlertTitle>PDF ready</AlertTitle>
                  <AlertDescription>
                    <a href={downloadUrl} className="inline-flex items-center gap-2 font-medium text-slate-900 underline" rel="noreferrer">
                      Download the current PDF
                      <ExternalLink className="size-4" />
                    </a>
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-white/95">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Reader previews</h2>
                <CardDescription>Load page previews and switch between art-first and transcript-first views.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowTranscript((current) => !current)} className="w-fit">
                {showTranscript ? "Hide text" : "Show text"}
              </Button>
            </CardHeader>
            <CardContent>
              {!bookPayload ? (
                <div className="rounded-xl border border-dashed border-border bg-slate-50 px-4 py-8 text-sm text-slate-500">
                  No preview payload loaded yet. Use “Load previews” when the build has progressed far enough to expose pages.
                </div>
              ) : (
                <Tabs defaultValue="pages" className="gap-4">
                  <TabsList variant="line" className="w-fit">
                    <TabsTrigger value="pages">Pages</TabsTrigger>
                    <TabsTrigger value="text">Story text</TabsTrigger>
                  </TabsList>
                  <TabsContent value="pages">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {bookPayload.pages.map((page) => {
                        const previewUrl = page.previewImageUrl ?? page.imageUrl;
                        return (
                          <Card key={page.pageIndex} className="border-border/70 bg-slate-50/70">
                            <CardHeader className="flex flex-row items-start justify-between gap-3">
                              <div>
                                <h3 className="text-base font-semibold text-slate-950">Page {page.pageIndex + 1}</h3>
                                <CardDescription>Preview and status</CardDescription>
                              </div>
                              <StatusBadge value={page.status} />
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {previewUrl ? (
                                <img
                                  src={previewUrl}
                                  alt={`Page ${page.pageIndex + 1}`}
                                  className="aspect-[4/5] w-full rounded-xl border border-border bg-white object-contain"
                                />
                              ) : (
                                <div className="rounded-xl border border-dashed border-border bg-white px-4 py-10 text-center text-sm text-slate-500">
                                  No page preview yet
                                </div>
                              )}
                              {showTranscript ? <p className="text-sm leading-6 text-slate-600">{page.text}</p> : null}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </TabsContent>
                  <TabsContent value="text">
                    <ScrollArea className="h-[32rem] rounded-xl border border-border bg-slate-50/70">
                      <div className="grid gap-4 p-4">
                        {bookPayload.pages.map((page) => (
                          <Card key={page.pageIndex} size="sm" className="border-border/70 bg-white">
                            <CardHeader>
                              <h3 className="text-sm font-semibold text-slate-950">Page {page.pageIndex + 1}</h3>
                            </CardHeader>
                            <CardContent className="text-sm leading-6 text-slate-600">{page.text}</CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-rose-200 bg-rose-50/70">
          <CardHeader>
            <h2 className="text-lg font-semibold text-slate-950">Privacy and reset</h2>
            <CardDescription>
              Delete the child profile and queued artifacts once you are done validating the current book.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-rose-700">
              This clears the active flow and queues artifact cleanup. Use it only when you are ready to remove the current child profile.
            </p>
            <Separator />
            <Button
              variant="destructive"
              onClick={() => {
                clearError();
                void deleteChildProfile();
              }}
              className="w-full"
            >
              <Trash2 className="size-4" />
              Delete child profile and artifacts
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link to="/create">Start a fresh order instead</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
