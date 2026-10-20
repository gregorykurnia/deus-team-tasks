"use client";

// A link that opens something over the current screen (+, Install), keeping the
// screen's own address state. The address is read in the browser only, so the
// first paint links to the bare param and the full link replaces it there.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, type ComponentProps } from "react";
import { over } from "./areas";

type OverLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  param: string; // as in "task=new"
  drop?: string[]; // params that go, such as the More sheet's own
};

export default function OverLink({ param, drop, ...rest }: OverLinkProps) {
  const pathname = usePathname();
  return (
    <Suspense fallback={<Link href={over(pathname, "", param)} {...rest} />}>
      <WithSearch param={param} drop={drop} {...rest} />
    </Suspense>
  );
}

function WithSearch({ param, drop, ...rest }: OverLinkProps) {
  const pathname = usePathname();
  const search = useSearchParams();
  return <Link href={over(pathname, search, param, drop)} {...rest} />;
}
