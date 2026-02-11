import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("step1", "routes/step1.tsx"),
  route("step2", "routes/step2.tsx"),
  route("step3", "routes/step3.tsx"),
  route("step4", "routes/step4.tsx"),
  route("perform", "routes/perform.tsx"),
] satisfies RouteConfig;
