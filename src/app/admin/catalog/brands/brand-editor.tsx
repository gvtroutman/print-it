"use client";

import { useActionState, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Button, Input, Label } from "@/components/ui";
import { toggleBrandAction, updateBrandAction, type EditableBrand } from "./actions";

export function BrandEditor({ brand, active }: { brand: EditableBrand; active: boolean }) {
  const [state, action, pending] = useActionState(updateBrandAction, { brand });
  const [name, setName] = useState(brand.name);
  const [aliases, setAliases] = useState(brand.aliases.join(", "));
  const [editingName, setEditingName] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const logo = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const removeLogo = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const id = useId();

  useLayoutEffect(() => {
    if (editingName) { nameInput.current?.focus(); nameInput.current?.select(); }
  }, [editingName]);

  useEffect(() => {
    submitting.current = false;
    if (state.saved) {
      setName(state.brand.name);
      setAliases(state.brand.aliases.join(", "));
      setEditingName(false);
    }
    if (logo.current) logo.current.value = "";
    if (removeLogo.current) removeLogo.current.value = "";
  }, [state]);

  function save(setting: "name" | "aliases" | "logo") {
    if (submitting.current || pending || !form.current || !field.current) return;
    if (!form.current.reportValidity()) return;
    field.current.value = setting;
    submitting.current = true;
    form.current.requestSubmit();
  }

  return <section data-brand-editor aria-label="Brand settings" aria-busy={pending}
    className="min-w-0 rounded-panel border-[3px] border-ink bg-porcelain p-[20px] shadow-stamp">
    <div className="mb-[16px] flex flex-wrap items-center justify-between gap-[12px]">
      <form ref={form} action={action} aria-label="Edit brand" className="contents">
        <input type="hidden" name="brandId" value={brand.id} />
        <input ref={field} type="hidden" name="field" defaultValue="name" />
        <input ref={removeLogo} type="hidden" name="removeLogo" defaultValue="" />
        <div className="flex min-w-0 basis-full items-center gap-[12px] sm:flex-1">
          <button type="button" aria-label={`Change ${state.brand.name} logo`} title="Change brand logo" disabled={pending}
            onClick={() => logo.current?.click()} className="flex-none cursor-pointer rounded-[6px] border-0 bg-transparent p-0 hover:ring-2 hover:ring-aqua focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink disabled:cursor-wait">
            <BrandLogo brand={state.brand} className="h-[54px] w-[90px]" />
          </button>
          <input ref={logo} type="file" name="logo" accept="image/png,image/jpeg,image/webp" aria-label="Brand logo" className="hidden"
            onChange={event => { if (event.target.files?.length) save("logo"); }} />
          <div className="min-w-0 flex-1">
            {editingName ? <input ref={nameInput} aria-label="Brand name" name="name" required maxLength={80} disabled={pending} value={name}
              onChange={event => setName(event.target.value)} onFocus={event => event.target.select()}
              onBlur={event => { if (event.target.value !== state.brand.name) save("name"); else setEditingName(false); }}
              onKeyDown={event => {
                if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
                if (event.key === "Escape") {
                  event.preventDefault(); event.currentTarget.value = state.brand.name;
                  setName(state.brand.name); setEditingName(false);
                }
              }} className="w-full min-w-0 rounded-[6px] border-0 bg-cream-2 p-0 text-[24px] font-bold text-ink outline-2 outline-offset-4 outline-aqua" />
              : <><input type="hidden" name="name" value={name} /><h2 className="m-0 text-[24px] text-ink">
                <button type="button" aria-label={`Edit ${state.brand.name} name`} title="Edit brand name" disabled={pending} onClick={() => setEditingName(true)}
                  className="max-w-full cursor-text break-words rounded-[4px] border-0 bg-transparent p-0 text-left font-[inherit] hover:bg-cream-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink disabled:cursor-wait">{state.brand.name}</button>
              </h2></>}
          </div>
        </div>
        <div className="order-last w-full min-w-0">
          <Label htmlFor={`${id}-aliases`}>Catalog aliases</Label>
          <Input id={`${id}-aliases`} name="aliases" value={aliases} disabled={pending} onChange={event => setAliases(event.target.value)}
            onBlur={event => { if (event.target.value !== state.brand.aliases.join(", ")) save("aliases"); }}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />
        </div>
      </form>
      <form action={toggleBrandAction}><input type="hidden" name="brandId" value={brand.id} />
        <Button type="submit" variant="secondary" disabled={pending}>{active ? "Turn brand off" : "Turn brand on"}</Button>
      </form>
    </div>
    {!active && <p className="m-0 mb-[10px] text-[13px] text-ink-2">This brand is hidden from new orders. You can still edit its listings.</p>}
    <p className="m-0 text-[11px] leading-[1.5] text-ink-3">Tap the logo or name to change it. Changes save automatically.</p>
    {state.brand.hasCustomLogo && <button type="button" disabled={pending} onClick={() => {
      if (removeLogo.current) removeLogo.current.value = "on";
      save("logo");
    }} className="mt-[6px] cursor-pointer border-0 bg-transparent p-0 text-[11px] text-ink-2 underline underline-offset-4 disabled:cursor-wait">Use default logo</button>}
    <p data-brand-save-status role={state.error ? "alert" : "status"} className={`m-0 mt-[6px] text-[12px] ${state.error ? "text-cherry-dk" : "text-ink-2"}`}>
      {pending ? "Saving…" : state.error ?? (state.saved ? "Saved." : "")}
    </p>
  </section>;
}
