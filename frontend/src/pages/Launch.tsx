import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Logo from "@/assets/logo-milky.svg";

const heroMeals = [
  {
    title: "Crispy Sesame Chicken Wraps",
    img: "https://cdn.leonardo.ai/users/8b23b98a-7c26-40c9-b17e-e10959b811bb/generations/2e976cd5-d84b-470f-bc64-1e371f44f7ae/Phoenix_10_A_delicious_Crispy_Sesame_Chicken_Wrap_slice_in_hal_0.jpg",
  },
  {
    title: "Salmon Burgers",
    img: "https://cdn.leonardo.ai/users/8b23b98a-7c26-40c9-b17e-e10959b811bb/generations/fd0166ec-ef9f-44b3-8019-374a4b594a3d/Phoenix_10_A_juicy_salmon_burger_cooked_to_perfection_served_o_0.jpg",
  },
  {
    title: "Shrimp Alfredo",
    img: "https://cdn.leonardo.ai/users/8b23b98a-7c26-40c9-b17e-e10959b811bb/generations/38cb41f9-9a03-4d43-a9b9-aefe0756a543/Phoenix_10_A_steaming_plate_of_Shrimp_Alfredo_with_succulent_s_0.jpg",
  },
  {
    title: "Quinoa Salad",
    img: "https://cdn.leonardo.ai/users/8b23b98a-7c26-40c9-b17e-e10959b811bb/generations/8cc598ef-01c6-4734-ac96-cf5e49067a48/Phoenix_10_A_vibrant_quinoa_salad_on_a_white_plate_featuring_c_0.jpg",
  },
];

export default function Launch() {
  return (
    <div className="min-h-screen landing-bg text-foreground">
      <main className="max-w-6xl mx-auto px-4 pt-16 pb-16">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <img src={Logo} alt="Milky" className="h-16 w-auto" />
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">Welcome to Milky 🥛</h1>
            <p className="text-lg text-muted-foreground max-w-xl">
              Meal planning that fits your life. Milky helps you plan meals, track nutrition, and organize shopping lists — all in one simple, beautiful space. Whether you’re trying to eat healthier, save time, or just stop wondering “what’s for dinner?”, Milky makes everyday food decisions effortless.
            </p>
            <p className="text-lg text-muted-foreground max-w-xl">
              Create meal plans in seconds, keep your favorite recipes close, track macros without the stress, and chat your way to smarter choices. Milky adapts to you — not the other way around. Eat better. Plan less. Enjoy more.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/register">Get Started</Link>
              </Button>
              <Button variant="secondary" size="lg" asChild>
                <Link to="/login">Log In</Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {heroMeals.map((meal) => (
              <div
                key={meal.title}
                className="rounded-3xl overflow-hidden shadow-soft bg-white/80 border border-emerald-100"
              >
                <div className="aspect-video w-full overflow-hidden">
                  <img src={meal.img} alt={meal.title} className="w-full h-full object-cover" />
                </div>
                <div className="p-4">
                  <p className="font-semibold text-foreground">{meal.title}</p>
                  <p className="text-sm text-muted-foreground">Fresh, balanced, and ready to swap.</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
