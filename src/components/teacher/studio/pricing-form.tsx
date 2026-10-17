"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { updateCoursePricingAction, type ActionState } from "@/app/teacher/(dashboard)/courses/[courseId]/actions";
import { useActionSuccess } from "@/hooks/use-action-success";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save pricing"}
    </Button>
  );
}

/** "Students pay $19.99 (60% off $49.99)" for whatever is typed, before saving. */
function summarise(priceText: string, saleText: string) {
  const price = Number(priceText);
  const sale = saleText.trim() === "" ? null : Number(saleText);
  if (priceText.trim() === "" || !Number.isFinite(price) || price < 0) return null;
  if (sale === null) return price === 0 ? "The course is free for every student." : `Students pay ${formatPrice(price)}.`;
  if (!Number.isFinite(sale) || sale < 0 || sale >= price) return null;
  const off = Math.round((1 - sale / price) * 100);
  return sale === 0
    ? `Free while the sale lasts (normally ${formatPrice(price)}).`
    : `Students pay ${formatPrice(sale)} - ${off}% off ${formatPrice(price)}.`;
}

export function PricingForm({
  courseId,
  price,
  salePrice,
}: {
  courseId: string;
  price: number;
  salePrice: number | null;
}) {
  const [state, formAction] = useActionState(updateCoursePricingAction.bind(null, courseId), initialState);
  const [priceText, setPriceText] = useState(String(price));
  const [saleText, setSaleText] = useState(salePrice != null ? String(salePrice) : "");
  const summary = summarise(priceText, saleText);

  useActionSuccess(state, initialState, () => toast.success("Pricing saved"));

  return (
    <form action={formAction} className="max-w-md space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="price">Price (USD)</Label>
        <div className="flex gap-2">
          <Input
            id="price"
            name="price"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            required
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPriceText("0");
              setSaleText("");
            }}
          >
            Make it free
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="salePrice">Sale price (optional)</Label>
        <Input
          id="salePrice"
          name="salePrice"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={saleText}
          onChange={(e) => setSaleText(e.target.value)}
          aria-describedby="sale-help"
        />
        <p id="sale-help" className="text-xs text-muted-foreground">
          Must be lower than the price. Leave blank to end a sale.
        </p>
      </div>

      <p className="rounded-lg bg-muted p-3 text-sm" aria-live="polite">
        {summary ?? "Enter a price, and a sale price lower than it."}
      </p>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <SaveButton />
    </form>
  );
}
