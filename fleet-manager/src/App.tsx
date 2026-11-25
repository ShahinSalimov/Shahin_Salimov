import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { DemoGate } from './components/DemoGate';
import Dashboard from './pages/Dashboard';
import Payments from './pages/Payments';
import Cars, { CarDetail } from './pages/Cars';
import Drivers, { DriverDetail } from './pages/Drivers';
import Fines from './pages/Fines';
import Expenses from './pages/Expenses';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import Customers from './pages/Customers';
import Cash from './pages/Cash';
import Reports from './pages/Reports';
import Morning from './pages/Morning';
import Settings from './pages/Settings';
import BusinessPage from './pages/Business';
import More from './pages/More';

function useRoute() {
  const get = () => location.hash.replace(/^#\/?/, '');
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => {
      setRoute(get());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export default function App() {
  const route = useRoute();
  const [path, qs] = route.split('?');
  const query = new URLSearchParams(qs ?? '');
  const [top, id] = path.split('/');

  let page;
  switch (top) {
    case '': page = <Dashboard />; break;
    case 'payments': page = <Payments />; break;
    case 'cars': page = id ? <CarDetail id={id} /> : <Cars />; break;
    case 'drivers': page = id ? <DriverDetail id={id} /> : <Drivers key={qs} query={query} />; break;
    case 'fines': page = <Fines />; break;
    case 'expenses': page = <Expenses />; break;
    case 'inventory': page = <Inventory />; break;
    case 'sales': page = <Sales />; break;
    case 'customers': page = <Customers />; break;
    case 'cash': page = <Cash />; break;
    case 'reports': page = <Reports />; break;
    case 'morning': page = <Morning />; break;
    case 'settings': page = <Settings key={qs} query={query} />; break;
    case 'biz': page = <BusinessPage key={id} id={id} />; break;
    case 'more': page = <More />; break;
    default: page = <Dashboard />;
  }
  return <DemoGate><Layout route={route}>{page}</Layout></DemoGate>;
}
