import { listCategories } from "@/server/services/category-service";
import { requireAdmin } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateCategoryForm, DeleteCategoryButton } from "@/components/admin/category-manager";

export default async function AdminCategoriesPage() {
  await requireAdmin();
  const categories = await listCategories();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Categories</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add category</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateCategoryForm />
        </CardContent>
      </Card>

      <div className="space-y-2">
        {categories.map((category) => (
          <div key={category.id} className="flex items-center justify-between rounded-md border px-4 py-2">
            <span>{category.name}</span>
            <DeleteCategoryButton categoryId={category.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
