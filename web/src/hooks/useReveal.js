import { useEffect, useRef } from "react";

export default function useReveal(options = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-visible");
        } else {
          // hide again so it can re-animate next time
          el.classList.remove("is-visible");
        }
      },
      {
        root: null,
        threshold: 0.15,
        rootMargin: "0px 0px -10% 0px",
        ...options,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [options]);

  return ref;
}
