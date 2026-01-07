import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigation } from "@/components/layout/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Heart, Trash2, Info } from "lucide-react";
import { getFavoriteRecipes, deleteFavoriteRecipe, ensureFavoriteImage } from "@/lib/api";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";

export default function Favorites() {
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<any | null>(null);
  const { data: favorites = [], isLoading, refetch } = useQuery({
    queryKey: ["favorites"],
    queryFn: getFavoriteRecipes,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFavoriteRecipe,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      toast.success("Favorite removed");
    },
    onError: () => toast.error("Failed to delete favorite"),
  });

  const ensureImage = async (favId: string) => {
    try {
      await ensureFavoriteImage(favId);
      await refetch();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-32 md:pt-36 pb-12 px-4 md:px-8 max-w-6xl mx-auto w-full">
        <div className="flex items-center justify-between gap-3 mb-8">
          <div>
            <p className="text-sm text-primary font-semibold">Favorites</p>
            <h1 className="text-3xl font-bold text-foreground">Saved Recipes</h1>
            <p className="text-muted-foreground mt-1">Quickly reuse your preferred meals when swapping.</p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
            <Heart className="h-5 w-5 text-primary" />
            <span>{favorites.length} saved</span>
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading favorites...</p>
        ) : favorites.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-6 text-center text-muted-foreground">
              <p>No favorites yet. Save recipes from chat or swap panels.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {favorites.map((fav, idx) => (
              <motion.div
                key={fav._id || fav.id || idx}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
              >
                <Card
                  className="glass-card-elevated h-full overflow-hidden cursor-pointer"
                  onClick={() => {
                    setSelected(fav);
                    const hasImage =
                      fav.planRecipe?.image ||
                      fav.planRecipe?.imageUrl ||
                      fav.image ||
                      fav.imageUrl;
                    if (!hasImage && (fav._id || fav.id)) {
                      ensureImage(fav._id || fav.id);
                    }
                  }}
                >
                  {(() => {
                    const img =
                      fav.planRecipe?.image ||
                      fav.planRecipe?.imageUrl ||
                      fav.image ||
                      fav.imageUrl;
                    const fallbackLabel = (fav.title || "Recipe").charAt(0).toUpperCase();
                    return (
                      <div className="w-full aspect-video bg-secondary/60 overflow-hidden flex items-center justify-center">
                        {img ? (
                          <img src={img} alt={fav.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 via-secondary/40 to-muted">
                            <span className="text-3xl font-bold text-primary/70">{fallbackLabel}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <CardContent className="p-4 space-y-3 h-full flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-primary font-semibold">Recipe</p>
                        <h3 className="text-lg font-semibold text-foreground truncate">{fav.title}</h3>
                        <p className="text-sm text-muted-foreground truncate">
                          {fav.calories ? `${fav.calories} cal` : "Macros pending"} {fav.protein ? `• ${fav.protein}g protein` : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(fav._id || fav.id);
                        }}
                        disabled={deleteMutation.isLoading}
                        title="Delete favorite"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className={cn("text-sm text-muted-foreground line-clamp-3", !fav.summary && "italic")}>
                      {fav.summary || "No description provided."}
                    </p>
                    {fav.tags?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {fav.tags.slice(0, 4).map((tag: string, tagIdx: number) => (
                          <span
                            key={tagIdx}
                            className="px-2 py-1 rounded-full bg-secondary text-xs text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">{selected?.title}</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {selected.calories ? `${selected.calories} cal` : "— cal"}{" "}
                {selected.protein ? `• ${selected.protein}g protein` : ""}
              </div>
              <p className="text-sm text-muted-foreground">{selected.summary || "No description provided."}</p>
              <div className="space-y-2">
                <p className="text-sm font-semibold">Ingredients</p>
                <div className="text-sm text-muted-foreground whitespace-pre-line">
                  {(() => {
                    const raw = selected.planRecipe?.ingredients;
                    const arr = Array.isArray(raw)
                      ? raw
                      : typeof raw === "string"
                        ? raw.split(/\r?\n+/).map((s: string) => s.trim()).filter(Boolean)
                        : [];
                    if (!arr.length) return "Not provided";
                    return arr
                      .map((ing: any) =>
                        typeof ing === "string"
                          ? ing
                          : [ing.amount, ing.unit, ing.name].filter(Boolean).join(" ")
                      )
                      .join("\n");
                  })()}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold">Instructions</p>
                {(() => {
                  const raw = selected.planRecipe?.instructions;
                  const arr = Array.isArray(raw)
                    ? raw
                    : typeof raw === "string"
                      ? raw.split(/\r?\n+/).map((s: string) => s.trim()).filter(Boolean)
                      : [];
                  if (!arr.length) {
                    return <div className="text-sm text-muted-foreground">Not provided</div>;
                  }
                  return (
                    <div className="text-sm text-muted-foreground space-y-1">
                      {arr.map((step: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="text-primary font-semibold">{idx + 1}.</span>
                          <span className="flex-1 whitespace-pre-line">{step}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
